import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, Page, test } from "@playwright/test";

function uniqueName(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

async function openWorkspace(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("new-project-button")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId("workspace-app-title")).toHaveText("The Big IDE");
}

async function createProjectViaUi(page: Page, projectName: string) {
  await page.getByTestId("new-project-button").click();
  await expect(page.getByTestId("project-name-input")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("project-name-input").fill(projectName);
  await page.getByTestId("create-project-button").click();
  await expect(page.getByRole("button", { name: projectName, exact: true })).toBeVisible({ timeout: 20_000 });
}

async function createSessionViaUi(page: Page, projectName: string, sessionName: string) {
  await page.locator(`[data-testid="new-session-button"][data-project-name="${projectName}"]`).click();
  await expect(page.getByTestId("session-name-input")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("session-name-input").fill(sessionName);
  await page.getByTestId("create-session-button").click();
  await expect(page.getByTestId("active-session-label")).toContainText(`Session: ${sessionName}`, { timeout: 20_000 });
}

async function openPanelViaUi(page: Page, kind: "agent" | "files" | "terminal" | "git" | "browser") {
  await page.getByTestId("new-panel-button").click();
  await page.getByTestId(`new-panel-option-${kind}`).click();
}

async function getDockerAvailable(page: Page) {
  return page.evaluate(async () => {
    const runtime = (window as unknown as { bigIDE?: any }).bigIDE;
    if (!runtime) {
      throw new Error("bigIDE API is not available");
    }

    const payload = await runtime.bootstrap();
    return Boolean(payload.docker?.available);
  });
}

async function setProjectSandboxMode(page: Page, projectName: string, mode: "docker" | "host") {
  await page.evaluate(
    async ({ projectName: name, sandboxMode }) => {
      const runtime = (window as unknown as { bigIDE?: any }).bigIDE;
      if (!runtime) {
        throw new Error("bigIDE API is not available");
      }

      const projects = await runtime.projects.list();
      const project = projects.find((entry: { name: string; id: string }) => entry.name === name);
      if (!project) {
        throw new Error(`Project not found: ${name}`);
      }

      await runtime.projects.updateSandbox({
        projectId: project.id,
        sandbox: {
          mode: sandboxMode
        }
      });
    },
    {
      projectName,
      sandboxMode: mode
    }
  );
}

function createGitFixtureRepo() {
  const repoRoot = mkdtempSync(join(tmpdir(), "big-ide-e2e-"));
  mkdirSync(join(repoRoot, "src", "nested"), { recursive: true });
  writeFileSync(join(repoRoot, "README.md"), "# Playwright fixture\n");
  writeFileSync(join(repoRoot, "src", "nested", "index.ts"), "export const fixture = 'ok';\n");

  execFileSync("git", ["init", "--initial-branch=main"], { cwd: repoRoot, stdio: "pipe" });
  execFileSync("git", ["config", "user.name", "Playwright"], { cwd: repoRoot, stdio: "pipe" });
  execFileSync("git", ["config", "user.email", "playwright@example.com"], { cwd: repoRoot, stdio: "pipe" });
  execFileSync("git", ["add", "."], { cwd: repoRoot, stdio: "pipe" });
  execFileSync("git", ["commit", "-m", "chore: init fixture"], { cwd: repoRoot, stdio: "pipe" });

  return repoRoot;
}

test.describe("usage recordings", () => {
  test.setTimeout(180_000);

  test("session lifecycle from UI", async ({ page }) => {
    const projectName = uniqueName("ui-project");
    const sessionName = uniqueName("ui-session");

    await openWorkspace(page);
    await createProjectViaUi(page, projectName);

    await expect(page.getByTestId("session-panel-empty-state")).toContainText("No session selected");

    await createSessionViaUi(page, projectName, sessionName);
    await expect(page.getByTestId("session-panel-rail")).toBeVisible();
    await expect(page.getByTestId("session-panel-scroll-region")).toHaveCSS("overflow-x", "auto");
    await expect(page.getByTestId("session-panel-rail")).toHaveCSS("flex-wrap", "nowrap");

    const agentPanel = page.locator("[data-testid='session-panel'][data-panel-id='agent']");
    await expect(agentPanel).toBeVisible();
    await expect(page.locator("[data-testid='session-panel']")).toHaveCount(1);
    await expect(page.getByTestId("agent-chat-surface")).toContainText("Start the session", { timeout: 20_000 });

    await page.getByLabel("Close Agent panel").click();
    await expect(page.locator("[data-testid='session-panel'][data-panel-id='agent']")).toHaveCount(0);
    await expect(page.locator("[data-testid='session-panel']")).toHaveCount(0);

    await openPanelViaUi(page, "agent");
    await expect(page.locator("[data-testid='session-panel'][data-panel-id='agent']")).toHaveCount(1);

    await openPanelViaUi(page, "files");
    await openPanelViaUi(page, "files");
    await expect(page.locator("[data-testid='session-panel'][data-panel-id='files']")).toHaveCount(2);

    await setProjectSandboxMode(page, projectName, "host");

    const sessionRow = page.locator(`[data-testid="session-row"][data-session-name="${sessionName}"]`);
    await expect(sessionRow).toHaveAttribute("data-session-status", "idle");

    await page.getByTestId("start-session-button").click();
    await expect(sessionRow).toHaveAttribute("data-session-status", "running", { timeout: 60_000 });

    await expect(page.getByTestId("session-runtime-context")).toHaveCount(0);
    await expect(page.getByTestId("session-sandbox-mode")).toHaveCount(0);
    await expect(page.getByTestId("session-agent-url")).toHaveCount(0);
    await expect(page.getByTestId("agent-chat-surface")).toBeVisible();

    await page.getByTestId("stop-session-button").click();
    await expect(sessionRow).toHaveAttribute("data-session-status", "idle", { timeout: 40_000 });
  });

  test("docker sandbox startup path shows agent chat when Docker works", async ({ page }) => {
    test.setTimeout(420_000);

    const dockerProjectName = uniqueName("docker-project");
    const dockerSessionName = uniqueName("docker-session");

    await openWorkspace(page);
    const dockerAvailable = await getDockerAvailable(page);
    test.skip(!dockerAvailable, "Docker is not available in this environment");

    await createProjectViaUi(page, dockerProjectName);
    await createSessionViaUi(page, dockerProjectName, dockerSessionName);
    await setProjectSandboxMode(page, dockerProjectName, "docker");

    const sessionRow = page.locator(`[data-testid="session-row"][data-session-name="${dockerSessionName}"]`);
    await page.getByTestId("start-session-button").click();
    await expect(sessionRow).toHaveAttribute("data-session-status", "running", { timeout: 240_000 });

    const runtimeInfo = await page.evaluate(
      async ({ projectName: name, sessionName: session }) => {
        const runtime = (window as unknown as { bigIDE?: any }).bigIDE;
        if (!runtime) {
          throw new Error("bigIDE API is not available");
        }

        const projects = await runtime.projects.list();
        const project = projects.find((entry: { name: string; sessions: Array<{ name: string; sandboxRuntime: { mode: string } | null }> }) => entry.name === name);
        const activeSession = project?.sessions.find((entry: { name: string }) => entry.name === session);
        return {
          sandboxMode: activeSession?.sandboxRuntime?.mode ?? null
        };
      },
      {
        projectName: dockerProjectName,
        sessionName: dockerSessionName
      }
    );

    expect(["docker", "host"]).toContain(runtimeInfo.sandboxMode);
    await expect(page.getByTestId("session-runtime-context")).toHaveCount(0);
    await expect(page.getByTestId("session-sandbox-mode")).toHaveCount(0);
    await expect(page.getByTestId("session-agent-url")).toHaveCount(0);
    if (runtimeInfo.sandboxMode === "docker") {
      await expect(page.getByTestId("agent-chat-iframe")).toBeVisible({ timeout: 240_000 });
    }

    await page.getByTestId("stop-session-button").click();
    await expect(sessionRow).toHaveAttribute("data-session-status", "idle", { timeout: 120_000 });
  });

  test("files open one-editor-per-file and git/browser panels stay usable", async ({ page }) => {
    const projectName = uniqueName("git-project");
    const sessionName = uniqueName("git-session");
    const fileName = `${uniqueName("playwright-change")}.txt`;
    const fixtureRepo = createGitFixtureRepo();

    try {
      await openWorkspace(page);
      await getDockerAvailable(page);

      const sessionWorkdir = await page.evaluate(
        async ({ projectName: name, sessionName: session, rootPath }) => {
          const runtime = (window as unknown as { bigIDE?: any }).bigIDE;
          if (!runtime) {
            throw new Error("bigIDE API is not available");
          }

          const project = await runtime.projects.create({
            name,
            rootPath
          });

          const createdSession = await runtime.sessions.create({
            projectId: project.id,
            name: session
          });

          return createdSession.workdir;
        },
        {
          projectName,
          sessionName,
          rootPath: fixtureRepo
        }
      );

      await setProjectSandboxMode(page, projectName, "host");
      await page.getByRole("button", { name: projectName, exact: true }).click();
      const sessionRow = page.locator(`[data-testid="session-row"][data-session-name="${sessionName}"]`);
      await sessionRow.click();
      await expect(page.getByTestId("active-session-label")).toContainText(`Session: ${sessionName}`);
      await expect(page.locator("[data-testid='session-panel']")).toHaveCount(1);

      await openPanelViaUi(page, "files");
      const filesPanel = page.locator("[data-testid='session-panel'][data-panel-id='files']").first();
      await expect(filesPanel).toBeVisible();
      await expect(page.locator("[data-testid='session-panel']")).toHaveCount(2);

      const srcDirPath = `${sessionWorkdir}/src`;
      const nestedFilePath = `${sessionWorkdir}/src/nested/index.ts`;
      await expect(page.locator(`[data-testid="file-tree-directory"][data-file-path="${srcDirPath}"]`)).toBeVisible({ timeout: 20_000 });
      await expect(page.locator(`[data-testid="file-tree-file"][data-file-path="${nestedFilePath}"]`)).toHaveCount(0);

      const readmePath = `${sessionWorkdir}/README.md`;
      const readmeRow = page.locator(`[data-testid="file-tree-file"][data-file-path="${readmePath}"]`);
      await expect(readmeRow).toBeVisible({ timeout: 20_000 });
      await readmeRow.click();

      const editorPanels = page.locator("[data-testid='session-panel'][data-panel-id='editor']");
      await expect(editorPanels).toHaveCount(1);
      await expect(page.locator("[data-testid='editor-tabs']")).toHaveCount(0);
      await expect(page.getByTestId("editor-active-path")).toContainText("README.md");

      await readmeRow.click();
      await expect(editorPanels).toHaveCount(1);

      await page.locator(`[data-testid="file-tree-directory"][data-file-path="${srcDirPath}"]`).click();
      await page.locator(`[data-testid="file-tree-directory"][data-file-path="${sessionWorkdir}/src/nested"]`).click();
      await page.locator(`[data-testid="file-tree-file"][data-file-path="${nestedFilePath}"]`).click();
      await expect(editorPanels).toHaveCount(2);
      await expect(page.getByTestId("editor-active-path")).toContainText("src/nested/index.ts");

      const firstEditorBox = await editorPanels.nth(0).boundingBox();
      expect(firstEditorBox).not.toBeNull();
      const secondEditorBox = await editorPanels.nth(1).boundingBox();
      expect(secondEditorBox).not.toBeNull();
      if (!firstEditorBox || !secondEditorBox) {
        throw new Error("Expected editor panels to have layout boxes");
      }
      expect(secondEditorBox.x).toBeGreaterThan(firstEditorBox.x);
      expect(Math.abs(secondEditorBox.y - firstEditorBox.y)).toBeLessThan(20);

      await openPanelViaUi(page, "git");
      const gitPanel = page.locator("[data-testid='session-panel'][data-panel-id='git']").first();
      await expect(gitPanel).toBeVisible();

      await page.evaluate(
        async ({ workdir, fileName: dirtyFile }) => {
          const runtime = (window as unknown as { bigIDE?: any }).bigIDE;
          if (!runtime) {
            throw new Error("bigIDE API is not available");
          }

          await runtime.fs.writeFile({
            filePath: `${workdir}/${dirtyFile}`,
            content: `playwright update ${Date.now()}\n`
          });
        },
        {
          workdir: sessionWorkdir,
          fileName
        }
      );

      await page.getByTestId("refresh-git-button").first().click();

      const gitRow = page.locator("[data-testid='git-file-row']", { hasText: fileName });
      await expect(gitRow).toBeVisible({ timeout: 20_000 });
      await gitRow.click();

      await expect(page.getByTestId("git-stage-button").first()).toBeEnabled();
      await page.getByTestId("git-stage-button").first().click();
      await expect(page.getByTestId("git-commit-button").first()).toBeEnabled({ timeout: 15_000 });

      await page.getByTestId("git-discard-button").first().click();
      await expect(gitRow).toHaveCount(0, { timeout: 20_000 });

      await openPanelViaUi(page, "browser");
      await expect(page.locator("[data-testid='session-panel'][data-panel-id='browser']")).toHaveCount(1);

      const healthUrl = "http://127.0.0.1:43111/api/health";
      await page.getByTestId("web-url-input").first().fill(healthUrl);
      await page.getByTestId("web-open-button").first().click();

      await expect(page.getByTestId("web-iframe").first()).toHaveAttribute("src", healthUrl, { timeout: 15_000 });
      await expect(page.getByTestId("web-status").first()).toContainText("status: loaded", { timeout: 20_000 });
    } finally {
      rmSync(fixtureRepo, { recursive: true, force: true });
    }
  });
});
