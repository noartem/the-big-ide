import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, ipcMain } from "electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_SANDBOX = {
  mode: "docker",
  image: "node:20-bookworm",
  command: "tail -f /dev/null",
  dependencies: ["node", "npm", "opencode"]
};

const SANDBOX_SERVICE_NAME = "sandbox";
const SANDBOX_TEMPLATE_DIR = path.join(__dirname, "sandbox-template");

const APP_STATE_VERSION = 1;

let mainWindow = null;
let paths = null;
let dockerStatus = {
  available: false,
  version: "",
  error: "Not checked yet"
};

let persistedState = {
  version: APP_STATE_VERSION,
  projects: []
};

const runtime = {
  terminals: new Map(),
  agents: new Map(),
  sandboxes: new Map()
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "project";
}

function getComposeProjectName(projectId, sessionId) {
  return `bigide-${projectId.slice(0, 8)}-${sessionId.slice(0, 8)}`;
}

function getSessionSandboxPaths(sessionWorkdir) {
  const sandboxRoot = path.join(sessionWorkdir, ".sandbox");
  return {
    root: sandboxRoot,
    composeFile: path.join(sandboxRoot, "compose.yml")
  };
}

function getHostUid() {
  if (typeof process.getuid === "function") {
    return String(process.getuid());
  }
  return "1000";
}

function getHostGid() {
  if (typeof process.getgid === "function") {
    return String(process.getgid());
  }
  return "1000";
}

function getHostUser() {
  try {
    const username = os.userInfo().username || "bigide";
    const safe = username.replace(/[^a-zA-Z0-9_-]/g, "");
    return safe || "bigide";
  } catch {
    return "bigide";
  }
}

function buildSandboxEnvironment(sandboxConfig, opencodePort) {
  return {
    APP_UID: getHostUid(),
    APP_GID: getHostGid(),
    APP_USER: getHostUser(),
    SANDBOX_IMAGE: sandboxConfig.image || DEFAULT_SANDBOX.image,
    SANDBOX_COMMAND: sandboxConfig.command || DEFAULT_SANDBOX.command,
    OPENCODE_PORT: String(opencodePort)
  };
}

function dockerComposeBaseArgs(composeFile, composeProjectName) {
  return ["compose", "-f", composeFile, "--project-name", composeProjectName];
}

function isSafeBinaryName(candidate) {
  return /^[a-zA-Z0-9._-]+$/.test(candidate);
}

function normalizePath(inputPath) {
  return path.resolve(inputPath);
}

function isPathInside(parentPath, targetPath) {
  const relative = path.relative(parentPath, targetPath);
  if (!relative) {
    return true;
  }

  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

function commandExists(command) {
  const checker = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(checker, [command], { encoding: "utf8" });
  return result.status === 0;
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      resolve({
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
}

async function reserveFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to reserve local port"));
        return;
      }
      server.close(() => resolve(address.port));
    });
    server.on("error", reject);
  });
}

function getPaths() {
  if (paths) {
    return paths;
  }

  const home = os.homedir();
  const workspaceRoot = path.join(home, ".big-ide");
  const projectsRoot = path.join(workspaceRoot, "projects");
  const sessionsRoot = path.join(workspaceRoot, "sessions");
  const stateFile = path.join(app.getPath("userData"), "state.json");

  paths = {
    workspaceRoot,
    projectsRoot,
    sessionsRoot,
    stateFile
  };

  return paths;
}

async function ensureDirs() {
  const filePaths = getPaths();
  await fs.mkdir(filePaths.workspaceRoot, { recursive: true });
  await fs.mkdir(filePaths.projectsRoot, { recursive: true });
  await fs.mkdir(filePaths.sessionsRoot, { recursive: true });
  await fs.mkdir(path.dirname(filePaths.stateFile), { recursive: true });
}

async function loadState() {
  const filePaths = getPaths();

  try {
    const raw = await fs.readFile(filePaths.stateFile, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.projects)) {
      persistedState = {
        version: parsed.version ?? APP_STATE_VERSION,
        projects: parsed.projects
      };
    }
  } catch {
    persistedState = {
      version: APP_STATE_VERSION,
      projects: []
    };
  }
}

async function saveState() {
  const filePaths = getPaths();
  const payload = JSON.stringify(persistedState, null, 2);
  await fs.writeFile(filePaths.stateFile, payload, "utf8");
}

function resolveProject(projectId) {
  const project = persistedState.projects.find((entry) => entry.id === projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }
  return project;
}

function resolveSession(project, sessionId) {
  const session = project.sessions.find((entry) => entry.id === sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  return session;
}

function getAllowedRoots() {
  const roots = new Set([getPaths().workspaceRoot]);

  for (const project of persistedState.projects) {
    if (project.rootPath) {
      roots.add(normalizePath(project.rootPath));
    }
    for (const session of project.sessions) {
      if (session.workdir) {
        roots.add(normalizePath(session.workdir));
      }
    }
  }

  return [...roots];
}

function assertAllowedPath(candidatePath) {
  const normalized = normalizePath(candidatePath);
  const allowed = getAllowedRoots().some((rootPath) => isPathInside(rootPath, normalized));
  if (!allowed) {
    throw new Error(`Path is outside workspace boundaries: ${candidatePath}`);
  }
  return normalized;
}

async function detectDocker() {
  const check = await runProcess("docker", ["--version"]).catch((error) => ({
    code: 1,
    stdout: "",
    stderr: error.message
  }));

  if (check.code === 0) {
    dockerStatus = {
      available: true,
      version: check.stdout || check.stderr,
      error: ""
    };
    return;
  }

  dockerStatus = {
    available: false,
    version: "",
    error: check.stderr || "Docker command is unavailable"
  };
}

async function isGitRepo(rootPath) {
  const check = await runProcess("git", ["-C", rootPath, "rev-parse", "--is-inside-work-tree"]).catch(
    () => ({ code: 1 })
  );
  return check.code === 0;
}

async function hasGitHistory(rootPath) {
  const check = await runProcess("git", ["-C", rootPath, "rev-parse", "--verify", "HEAD"]).catch(() => ({
    code: 1
  }));
  return check.code === 0;
}

const GIT_STATUS_LABELS = {
  M: "modified",
  A: "added",
  D: "removed",
  R: "renamed",
  C: "copied",
  U: "conflict"
};

function assertGitCwd(cwd) {
  if (typeof cwd !== "string" || !cwd.trim()) {
    throw new Error("cwd is required");
  }

  return assertAllowedPath(cwd);
}

function assertGitFilePath(filePath) {
  if (typeof filePath !== "string" || !filePath.trim()) {
    throw new Error("filePath is required");
  }

  if (path.isAbsolute(filePath)) {
    throw new Error("filePath must be relative to repository root");
  }

  const normalized = path.posix.normalize(filePath.replace(/\\/g, "/"));
  if (normalized.startsWith("../") || normalized === "..") {
    throw new Error("filePath cannot traverse outside repository");
  }

  return normalized;
}

function normalizeGitPath(pathText) {
  if (!pathText) {
    return "";
  }

  const renamedChunks = pathText.split(" -> ");
  return renamedChunks[renamedChunks.length - 1].replace(/^"+|"+$/g, "");
}

function describeGitStatus(indexStatus, worktreeStatus) {
  if (indexStatus === "?" && worktreeStatus === "?") {
    return "A added";
  }

  const primaryStatus = indexStatus !== " " ? indexStatus : worktreeStatus;
  const label = GIT_STATUS_LABELS[primaryStatus] || "changed";
  const code = primaryStatus === " " ? "M" : primaryStatus;
  return `${code} ${label}`;
}

function parseAheadBehind(counterText) {
  const [aheadRaw, behindRaw] = counterText.trim().split(/\s+/);
  return {
    ahead: Number.parseInt(aheadRaw, 10) || 0,
    behind: Number.parseInt(behindRaw, 10) || 0
  };
}

async function readGitStatus(cwd) {
  const safeCwd = assertGitCwd(cwd);
  const repo = await isGitRepo(safeCwd);
  if (!repo) {
    return {
      isRepo: false,
      branch: null,
      upstream: null,
      ahead: 0,
      behind: 0,
      files: [],
      latestCommit: null
    };
  }

  const branchResult = await runProcess("git", ["-C", safeCwd, "rev-parse", "--abbrev-ref", "HEAD"]);
  if (branchResult.code !== 0) {
    throw new Error(branchResult.stderr || "Failed to resolve git branch");
  }

  const upstreamResult = await runProcess("git", [
    "-C",
    safeCwd,
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{upstream}"
  ]).catch(() => ({ code: 1, stdout: "", stderr: "" }));

  let ahead = 0;
  let behind = 0;
  if (upstreamResult.code === 0) {
    const counterResult = await runProcess("git", ["-C", safeCwd, "rev-list", "--left-right", "--count", "HEAD...@{upstream}"])
      .catch(() => ({ code: 1, stdout: "", stderr: "" }));
    if (counterResult.code === 0 && counterResult.stdout) {
      ({ ahead, behind } = parseAheadBehind(counterResult.stdout));
    }
  }

  const statusResult = await runProcess("git", ["-C", safeCwd, "status", "--porcelain=1"]);
  if (statusResult.code !== 0) {
    throw new Error(statusResult.stderr || "Failed to read git status");
  }

  const files = statusResult.stdout
    ? statusResult.stdout
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .map((line) => {
        const indexStatus = line[0] || " ";
        const worktreeStatus = line[1] || " ";
        const pathText = normalizeGitPath(line.slice(3).trim());
        const untracked = indexStatus === "?" && worktreeStatus === "?";

        return {
          path: pathText,
          indexStatus,
          worktreeStatus,
          displayStatus: describeGitStatus(indexStatus, worktreeStatus),
          staged: !untracked && indexStatus !== " ",
          unstaged: !untracked && worktreeStatus !== " ",
          untracked
        };
      })
    : [];

  const commitResult = await runProcess("git", ["-C", safeCwd, "log", "-1", "--pretty=%s"]).catch(() => ({
    code: 1,
    stdout: "",
    stderr: ""
  }));

  return {
    isRepo: true,
    branch: branchResult.stdout || null,
    upstream: upstreamResult.code === 0 ? upstreamResult.stdout : null,
    ahead,
    behind,
    files,
    latestCommit: commitResult.code === 0 ? commitResult.stdout : null
  };
}

async function stageGitChanges({ cwd, filePath }) {
  const safeCwd = assertGitCwd(cwd);
  const args = filePath
    ? ["-C", safeCwd, "add", "--", assertGitFilePath(filePath)]
    : ["-C", safeCwd, "add", "-A"];

  const stageResult = await runProcess("git", args);
  if (stageResult.code !== 0) {
    throw new Error(stageResult.stderr || "Failed to stage git changes");
  }

  return readGitStatus(safeCwd);
}

async function discardGitChanges({ cwd, filePath, untracked }) {
  const safeCwd = assertGitCwd(cwd);
  const targetPath = assertGitFilePath(filePath);

  if (untracked) {
    const cleanResult = await runProcess("git", ["-C", safeCwd, "clean", "-f", "--", targetPath]);
    if (cleanResult.code !== 0) {
      throw new Error(cleanResult.stderr || "Failed to discard untracked file");
    }
    return readGitStatus(safeCwd);
  }

  const restoreResult = await runProcess("git", ["-C", safeCwd, "restore", "--staged", "--worktree", "--", targetPath]).catch(
    (error) => ({
      code: 1,
      stdout: "",
      stderr: error.message
    })
  );

  if (restoreResult.code !== 0) {
    const fallbackResult = await runProcess("git", ["-C", safeCwd, "restore", "--worktree", "--", targetPath]).catch((error) => ({
      code: 1,
      stdout: "",
      stderr: error.message
    }));

    if (fallbackResult.code !== 0) {
      throw new Error(fallbackResult.stderr || restoreResult.stderr || "Failed to discard git changes");
    }
  }

  return readGitStatus(safeCwd);
}

async function commitGitChanges({ cwd, message }) {
  const safeCwd = assertGitCwd(cwd);
  const commitMessage = typeof message === "string" ? message.trim() : "";
  if (!commitMessage) {
    throw new Error("Commit message is required");
  }

  const commitResult = await runProcess("git", ["-C", safeCwd, "commit", "-m", commitMessage]).catch((error) => ({
    code: 1,
    stdout: "",
    stderr: error.message
  }));

  if (commitResult.code !== 0) {
    throw new Error(commitResult.stderr || commitResult.stdout || "Failed to create git commit");
  }

  return {
    status: await readGitStatus(safeCwd),
    output: commitResult.stdout || commitResult.stderr || "Commit created"
  };
}

async function copyProjectContent(sourcePath, destinationPath) {
  await fs.mkdir(destinationPath, { recursive: true });
  await fs.cp(sourcePath, destinationPath, {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(sourcePath, source);
      if (!relative) {
        return true;
      }

      const chunks = relative.split(path.sep);
      if (chunks.includes(".git")) {
        return false;
      }
      if (chunks.includes("node_modules")) {
        return false;
      }
      return true;
    }
  });
}

async function createSessionWorkspace(projectRootPath, sessionWorkdir) {
  const workdirParent = path.dirname(sessionWorkdir);
  await fs.mkdir(workdirParent, { recursive: true });

  if (!projectRootPath || !fsSync.existsSync(projectRootPath)) {
    await fs.mkdir(sessionWorkdir, { recursive: true });
    return "empty";
  }

  const useGitWorktree = (await isGitRepo(projectRootPath)) && (await hasGitHistory(projectRootPath));
  if (useGitWorktree) {
    const worktree = await runProcess("git", ["-C", projectRootPath, "worktree", "add", "--detach", sessionWorkdir])
      .catch((error) => ({ code: 1, stderr: error.message, stdout: "" }));

    if (worktree.code === 0) {
      return "git-worktree";
    }
  }

  await copyProjectContent(projectRootPath, sessionWorkdir);
  return "copy";
}

async function ensureSessionSandboxScaffold(sessionWorkdir) {
  if (!fsSync.existsSync(SANDBOX_TEMPLATE_DIR)) {
    throw new Error(`Sandbox template directory is missing: ${SANDBOX_TEMPLATE_DIR}`);
  }

  const sandboxPaths = getSessionSandboxPaths(sessionWorkdir);
  await fs.mkdir(sandboxPaths.root, { recursive: true });
  await fs.cp(SANDBOX_TEMPLATE_DIR, sandboxPaths.root, {
    recursive: true,
    force: false,
    errorOnExist: false
  });

  return sandboxPaths;
}

async function isDockerComposeAvailable() {
  const check = await runProcess("docker", ["compose", "version"]).catch((error) => ({
    code: 1,
    stdout: "",
    stderr: error.message
  }));

  return {
    available: check.code === 0,
    stdout: check.stdout,
    stderr: check.stderr
  };
}

async function checkDependenciesOnHost(dependencies) {
  const available = [];
  const missing = [];

  for (const dependency of dependencies) {
    if (commandExists(dependency)) {
      available.push(dependency);
    } else {
      missing.push(dependency);
    }
  }

  return {
    available,
    missing,
    checkedAt: new Date().toISOString()
  };
}

async function checkDependenciesInComposeService({
  composeFile,
  composeProjectName,
  workdir,
  serviceName,
  dependencies,
  composeEnv
}) {
  const available = [];
  const missing = [];
  const logs = [];

  const baseArgs = dockerComposeBaseArgs(composeFile, composeProjectName);
  const env = {
    ...process.env,
    ...(composeEnv || {})
  };

  for (const dependency of dependencies) {
    if (!isSafeBinaryName(dependency)) {
      missing.push(dependency);
      logs.push(`Unsafe dependency token ignored: ${dependency}`);
      continue;
    }

    const check = await runProcess(
      "docker",
      [
        ...baseArgs,
        "exec",
        "-T",
        serviceName,
        "sh",
        "-lc",
        `command -v ${dependency} >/dev/null 2>&1`
      ],
      {
        cwd: workdir,
        env
      }
    ).catch(() => ({ code: 1 }));

    if (check.code === 0) {
      available.push(dependency);
    } else {
      missing.push(dependency);
    }
  }

  return {
    available,
    missing,
    checkedAt: new Date().toISOString(),
    logs
  };
}

async function startSandbox(project, session) {
  const sandboxConfig = {
    ...DEFAULT_SANDBOX,
    ...(project.sandbox || {})
  };

  const logs = [];

  const sandboxPaths = await ensureSessionSandboxScaffold(session.workdir).catch((error) => {
    logs.push(`Sandbox scaffold failed: ${error.message}`);
    return null;
  });

  if (!sandboxPaths) {
    const dependencyReport = await checkDependenciesOnHost(sandboxConfig.dependencies);
    const runtimeState = {
      mode: "host",
      image: null,
      containerName: null,
      workdir: session.workdir,
      dependencies: dependencyReport,
      logs
    };
    runtime.sandboxes.set(session.id, runtimeState);
    return runtimeState;
  }

  if (!dockerStatus.available || sandboxConfig.mode !== "docker") {
    logs.push("Docker unavailable or sandbox mode disabled. Falling back to host mode.");
    const dependencyReport = await checkDependenciesOnHost(sandboxConfig.dependencies);
    const runtimeState = {
      mode: "host",
      image: null,
      containerName: null,
      workdir: session.workdir,
      dependencies: dependencyReport,
      logs
    };
    runtime.sandboxes.set(session.id, runtimeState);
    return runtimeState;
  }

  const composeCheck = await isDockerComposeAvailable();
  if (!composeCheck.available) {
    logs.push(`Docker Compose unavailable: ${composeCheck.stderr || "docker compose is not installed"}`);
    logs.push("Falling back to host mode.");

    const dependencyReport = await checkDependenciesOnHost(sandboxConfig.dependencies);
    const fallbackRuntime = {
      mode: "host",
      image: null,
      containerName: null,
      workdir: session.workdir,
      dependencies: dependencyReport,
      logs
    };
    runtime.sandboxes.set(session.id, fallbackRuntime);
    return fallbackRuntime;
  }

  const composeProjectName = getComposeProjectName(project.id, session.id);
  const opencodePort = await reserveFreePort();
  const composeEnv = buildSandboxEnvironment(sandboxConfig, opencodePort);
  const env = {
    ...process.env,
    ...composeEnv
  };
  const composeArgs = dockerComposeBaseArgs(sandboxPaths.composeFile, composeProjectName);

  await runProcess("docker", [...composeArgs, "down", "--remove-orphans"], {
    cwd: session.workdir,
    env
  }).catch(() => ({ code: 0 }));

  const composeUp = await runProcess(
    "docker",
    [...composeArgs, "up", "-d", "--build", SANDBOX_SERVICE_NAME],
    {
      cwd: session.workdir,
      env
    }
  ).catch((error) => ({ code: 1, stderr: error.message, stdout: "" }));

  if (composeUp.code !== 0) {
    logs.push(`Docker Compose launch failed: ${composeUp.stderr || composeUp.stdout}`);
    logs.push("Falling back to host mode.");

    const dependencyReport = await checkDependenciesOnHost(sandboxConfig.dependencies);
    const fallbackState = {
      mode: "host",
      image: null,
      containerName: null,
      workdir: session.workdir,
      dependencies: dependencyReport,
      logs
    };
    runtime.sandboxes.set(session.id, fallbackState);
    return fallbackState;
  }

  const containerCheck = await runProcess("docker", [...composeArgs, "ps", "-q", SANDBOX_SERVICE_NAME], {
    cwd: session.workdir,
    env
  }).catch(() => ({ code: 1, stdout: "", stderr: "" }));
  const containerName =
    containerCheck.code === 0 && containerCheck.stdout
      ? containerCheck.stdout
      : `${composeProjectName}-${SANDBOX_SERVICE_NAME}-1`;

  const dependencyReport = await checkDependenciesInComposeService({
    composeFile: sandboxPaths.composeFile,
    composeProjectName,
    workdir: session.workdir,
    serviceName: SANDBOX_SERVICE_NAME,
    dependencies: sandboxConfig.dependencies,
    composeEnv
  });

  if (dependencyReport.logs.length > 0) {
    logs.push(...dependencyReport.logs);
  }
  if (dependencyReport.missing.length > 0) {
    logs.push(`Missing dependencies in sandbox: ${dependencyReport.missing.join(", ")}`);
  }

  const runtimeState = {
    mode: "docker",
    image: sandboxConfig.image,
    containerName,
    workdir: session.workdir,
    dependencies: dependencyReport,
    logs,
    composeFile: sandboxPaths.composeFile,
    composeProjectName,
    composeEnv,
    serviceName: SANDBOX_SERVICE_NAME,
    opencodePort
  };

  runtime.sandboxes.set(session.id, runtimeState);
  return runtimeState;
}

async function stopSandbox(sessionId) {
  const sandboxRuntime = runtime.sandboxes.get(sessionId);
  if (!sandboxRuntime) {
    return;
  }

  if (sandboxRuntime.mode === "docker") {
    if (sandboxRuntime.composeFile && sandboxRuntime.composeProjectName) {
      const composeArgs = dockerComposeBaseArgs(sandboxRuntime.composeFile, sandboxRuntime.composeProjectName);
      const env = {
        ...process.env,
        ...(sandboxRuntime.composeEnv || {})
      };

      await runProcess("docker", [...composeArgs, "down", "--remove-orphans"], {
        cwd: sandboxRuntime.workdir,
        env
      }).catch(() => ({ code: 1 }));
    } else if (sandboxRuntime.containerName) {
      await runProcess("docker", ["stop", sandboxRuntime.containerName]).catch(() => ({ code: 1 }));
    }
  }

  runtime.sandboxes.delete(sessionId);
}

async function detectOpenCodeServeArgs() {
  if (!commandExists("opencode")) {
    return null;
  }

  const help = await runProcess("opencode", ["--help"]).catch(() => ({
    code: 1,
    stdout: "",
    stderr: ""
  }));
  const helpText = `${help.stdout}\n${help.stderr}`;

  if (helpText.includes(" serve") || helpText.includes("\nserve")) {
    return ["serve"];
  }

  if (helpText.includes(" server") || helpText.includes("\nserver")) {
    return ["server"];
  }

  return ["serve"];
}

function wireAgentProcess(sessionId, child) {
  child.stdout.on("data", (chunk) => {
    mainWindow?.webContents.send("agent:log", {
      sessionId,
      stream: "stdout",
      chunk: chunk.toString()
    });
  });

  child.stderr.on("data", (chunk) => {
    mainWindow?.webContents.send("agent:log", {
      sessionId,
      stream: "stderr",
      chunk: chunk.toString()
    });
  });

  child.on("close", (code) => {
    runtime.agents.delete(sessionId);
    mainWindow?.webContents.send("agent:status", {
      sessionId,
      status: "stopped",
      code
    });
  });

  child.on("error", (error) => {
    runtime.agents.delete(sessionId);
    mainWindow?.webContents.send("agent:status", {
      sessionId,
      status: "failed",
      message: error.message
    });
  });
}

async function startOpenCodeAgent(session) {
  const sandboxRuntime = runtime.sandboxes.get(session.id);
  if (sandboxRuntime?.mode === "docker" && sandboxRuntime.composeFile && sandboxRuntime.composeProjectName) {
    if (sandboxRuntime.dependencies?.missing?.includes("opencode")) {
      return {
        status: "missing-opencode",
        port: null,
        command: null,
        message: "OpenCode is missing inside sandbox container."
      };
    }

    const port = sandboxRuntime.opencodePort || (await reserveFreePort());
    const composeArgs = dockerComposeBaseArgs(sandboxRuntime.composeFile, sandboxRuntime.composeProjectName);
    const env = {
      ...process.env,
      ...(sandboxRuntime.composeEnv || {}),
      OPENCODE_PORT: String(port)
    };
    const serviceName = sandboxRuntime.serviceName || SANDBOX_SERVICE_NAME;
    const commandLine = `if command -v opencode >/dev/null 2>&1; then (opencode serve --port ${port} || opencode server --port ${port}); else exit 127; fi`;
    const args = [...composeArgs, "exec", "-T", serviceName, "sh", "-lc", commandLine];

    const child = spawn("docker", args, {
      cwd: sandboxRuntime.workdir || session.workdir,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    wireAgentProcess(session.id, child);

    runtime.agents.set(session.id, {
      process: child,
      port,
      command: `docker ${args.join(" ")}`
    });

    return {
      status: "running",
      port,
      command: `docker ${args.join(" ")}`,
      message: "OpenCode server started in sandbox."
    };
  }

  const serveArgs = await detectOpenCodeServeArgs();
  if (!serveArgs) {
    return {
      status: "missing-opencode",
      port: null,
      command: null,
      message: "OpenCode CLI not found on host."
    };
  }

  const port = await reserveFreePort();
  const args = [...serveArgs, "--port", String(port)];
  const child = spawn("opencode", args, {
    cwd: session.workdir,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  wireAgentProcess(session.id, child);

  runtime.agents.set(session.id, {
    process: child,
    port,
    command: `opencode ${args.join(" ")}`
  });

  return {
    status: "running",
    port,
    command: `opencode ${args.join(" ")}`,
    message: "OpenCode server started."
  };
}

function stopOpenCodeAgent(sessionId) {
  const runtimeAgent = runtime.agents.get(sessionId);
  if (!runtimeAgent) {
    return;
  }

  runtimeAgent.process.kill("SIGTERM");
  runtime.agents.delete(sessionId);
}

function startTerminal(sessionId, cwd) {
  if (runtime.terminals.has(sessionId)) {
    return {
      alreadyRunning: true
    };
  }

  const sandboxRuntime = runtime.sandboxes.get(sessionId);
  const dockerTerminalAvailable =
    sandboxRuntime?.mode === "docker" && sandboxRuntime.composeFile && sandboxRuntime.composeProjectName;

  let child = null;
  let shellLabel = process.platform === "win32" ? "powershell.exe" : process.env.SHELL || "/bin/bash";

  if (dockerTerminalAvailable) {
    const composeArgs = dockerComposeBaseArgs(sandboxRuntime.composeFile, sandboxRuntime.composeProjectName);
    const serviceName = sandboxRuntime.serviceName || SANDBOX_SERVICE_NAME;
    const args = [
      ...composeArgs,
      "exec",
      "-i",
      "-w",
      "/workspace",
      serviceName,
      "sh",
      "-lc",
      "if command -v zsh >/dev/null 2>&1; then exec zsh -i; else exec sh -i; fi"
    ];
    const env = {
      ...process.env,
      ...(sandboxRuntime.composeEnv || {}),
      TERM: "xterm-256color"
    };

    child = spawn("docker", args, {
      cwd: sandboxRuntime.workdir || cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    shellLabel = "docker:sandbox";
  } else {
    const shellArgs = process.platform === "win32" ? [] : ["-i"];
    child = spawn(shellLabel, shellArgs, {
      cwd,
      env: {
        ...process.env,
        TERM: "xterm-256color"
      },
      stdio: ["pipe", "pipe", "pipe"]
    });
  }

  child.stdout.on("data", (chunk) => {
    mainWindow?.webContents.send("terminal:data", {
      sessionId,
      data: chunk.toString()
    });
  });

  child.stderr.on("data", (chunk) => {
    mainWindow?.webContents.send("terminal:data", {
      sessionId,
      data: chunk.toString()
    });
  });

  child.on("close", (code, signal) => {
    runtime.terminals.delete(sessionId);
    mainWindow?.webContents.send("terminal:exit", {
      sessionId,
      code,
      signal
    });
  });

  child.on("error", (error) => {
    mainWindow?.webContents.send("terminal:data", {
      sessionId,
      data: `\r\n[terminal error] ${error.message}\r\n`
    });
  });

  runtime.terminals.set(sessionId, child);
  return {
    alreadyRunning: false,
    shell: shellLabel
  };
}

function writeToTerminal(sessionId, data) {
  const child = runtime.terminals.get(sessionId);
  if (!child || !child.stdin || child.killed) {
    return;
  }
  child.stdin.write(data);
}

function stopTerminal(sessionId) {
  const child = runtime.terminals.get(sessionId);
  if (!child) {
    return;
  }
  child.kill("SIGTERM");
  runtime.terminals.delete(sessionId);
}

async function buildFileTree(rootPath, maxDepth = 5, depth = 0) {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const filtered = entries.filter((entry) => {
    if (entry.name === ".git" || entry.name === "node_modules") {
      return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) {
      return -1;
    }
    if (!a.isDirectory() && b.isDirectory()) {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });

  const nodes = [];

  for (const entry of filtered) {
    const fullPath = path.join(rootPath, entry.name);

    if (entry.isDirectory()) {
      const node = {
        name: entry.name,
        path: fullPath,
        type: "directory"
      };

      if (depth < maxDepth) {
        try {
          node.children = await buildFileTree(fullPath, maxDepth, depth + 1);
        } catch {
          node.children = [];
        }
      }

      nodes.push(node);
    } else if (entry.isFile()) {
      nodes.push({
        name: entry.name,
        path: fullPath,
        type: "file"
      });
    }
  }

  return nodes;
}

async function initializeAppState() {
  await ensureDirs();
  await loadState();
  await detectDocker();
}

function makeWindow() {
  mainWindow = new BrowserWindow({
    width: 1680,
    height: 980,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#f4efe5",
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

function registerIpc() {
  ipcMain.handle("ide:bootstrap", async () => {
    return {
      runtimeTarget: "electron",
      workspaceRoot: getPaths().workspaceRoot,
      defaultSandbox: DEFAULT_SANDBOX,
      docker: dockerStatus,
      projects: deepClone(persistedState.projects)
    };
  });

  ipcMain.handle("projects:list", async () => {
    return deepClone(persistedState.projects);
  });

  ipcMain.handle("projects:create", async (_, payload) => {
    const safeName = (payload.name || "").trim();
    if (!safeName) {
      throw new Error("Project name is required");
    }

    let projectRootPath = (payload.rootPath || "").trim();
    if (!projectRootPath) {
      const dirName = `${slugify(safeName)}-${Math.random().toString(36).slice(2, 8)}`;
      projectRootPath = path.join(getPaths().projectsRoot, dirName);
    }

    projectRootPath = normalizePath(projectRootPath);
    await fs.mkdir(projectRootPath, { recursive: true });

    const project = {
      id: randomUUID(),
      name: safeName,
      rootPath: projectRootPath,
      createdAt: new Date().toISOString(),
      sandbox: {
        ...DEFAULT_SANDBOX,
        ...(payload.sandbox || {})
      },
      sessions: []
    };

    persistedState.projects.unshift(project);
    await saveState();
    return deepClone(project);
  });

  ipcMain.handle("projects:update-sandbox", async (_, payload) => {
    const project = resolveProject(payload.projectId);
    project.sandbox = {
      ...project.sandbox,
      ...(payload.sandbox || {})
    };

    await saveState();
    return deepClone(project);
  });

  ipcMain.handle("sessions:create", async (_, payload) => {
    const project = resolveProject(payload.projectId);
    const sessionId = randomUUID();
    const sessionWorkdir = path.join(getPaths().sessionsRoot, project.id, sessionId);
    const workspaceStrategy = await createSessionWorkspace(project.rootPath, sessionWorkdir);
    await ensureSessionSandboxScaffold(sessionWorkdir);

    const session = {
      id: sessionId,
      name: (payload.name || "").trim() || `Session ${project.sessions.length + 1}`,
      createdAt: new Date().toISOString(),
      status: "idle",
      agentStatus: "stopped",
      workdir: sessionWorkdir,
      workspaceStrategy,
      sandboxRuntime: null,
      agentRuntime: null
    };

    project.sessions.unshift(session);
    await saveState();
    return deepClone(session);
  });

  ipcMain.handle("sessions:rename", async (_, payload) => {
    const project = resolveProject(payload.projectId);
    const session = resolveSession(project, payload.sessionId);
    const nextName = (payload.name || "").trim();

    if (!nextName) {
      throw new Error("Session name is required");
    }

    session.name = nextName;
    await saveState();
    return deepClone(session);
  });

  ipcMain.handle("sessions:start", async (_, payload) => {
    const project = resolveProject(payload.projectId);
    const session = resolveSession(project, payload.sessionId);

    const sandboxRuntime = await startSandbox(project, session);
    const agentRuntime = await startOpenCodeAgent(session);

    session.status = "running";
    session.agentStatus = agentRuntime.status;
    session.sandboxRuntime = sandboxRuntime;
    session.agentRuntime = agentRuntime;
    await saveState();

    return deepClone(session);
  });

  ipcMain.handle("sessions:stop", async (_, payload) => {
    const project = resolveProject(payload.projectId);
    const session = resolveSession(project, payload.sessionId);

    stopTerminal(session.id);
    stopOpenCodeAgent(session.id);
    await stopSandbox(session.id);

    session.status = "idle";
    session.agentStatus = "stopped";
    session.agentRuntime = {
      status: "stopped",
      port: null,
      command: null,
      message: "Session stopped"
    };
    await saveState();

    return deepClone(session);
  });

  ipcMain.handle("fs:tree", async (_, payload) => {
    const rootPath = assertAllowedPath(payload.rootPath);
    const maxDepth = Number.isFinite(payload.maxDepth) ? payload.maxDepth : 5;
    return buildFileTree(rootPath, maxDepth);
  });

  ipcMain.handle("fs:read-file", async (_, payload) => {
    const filePath = assertAllowedPath(payload.filePath);
    const data = await fs.readFile(filePath, "utf8");
    return data;
  });

  ipcMain.handle("fs:write-file", async (_, payload) => {
    const filePath = assertAllowedPath(payload.filePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, payload.content, "utf8");
    return { ok: true };
  });

  ipcMain.handle("terminal:start", async (_, payload) => {
    const cwd = assertAllowedPath(payload.cwd);
    return startTerminal(payload.sessionId, cwd);
  });

  ipcMain.handle("terminal:write", async (_, payload) => {
    writeToTerminal(payload.sessionId, payload.data);
    return { ok: true };
  });

  ipcMain.handle("terminal:stop", async (_, payload) => {
    stopTerminal(payload.sessionId);
    return { ok: true };
  });

  ipcMain.handle("git:status", async (_, payload) => {
    return readGitStatus(payload.cwd);
  });

  ipcMain.handle("git:stage", async (_, payload) => {
    return stageGitChanges({
      cwd: payload.cwd,
      filePath: payload.filePath
    });
  });

  ipcMain.handle("git:discard", async (_, payload) => {
    return discardGitChanges({
      cwd: payload.cwd,
      filePath: payload.filePath,
      untracked: payload.untracked
    });
  });

  ipcMain.handle("git:commit", async (_, payload) => {
    return commitGitChanges({
      cwd: payload.cwd,
      message: payload.message
    });
  });
}

async function shutdownRuntimes() {
  for (const sessionId of runtime.terminals.keys()) {
    stopTerminal(sessionId);
  }

  for (const sessionId of runtime.agents.keys()) {
    stopOpenCodeAgent(sessionId);
  }

  for (const sessionId of runtime.sandboxes.keys()) {
    await stopSandbox(sessionId);
  }
}

app.whenReady().then(async () => {
  await initializeAppState();
  registerIpc();
  makeWindow();
});

app.on("before-quit", async () => {
  await shutdownRuntimes();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    makeWindow();
  }
});
