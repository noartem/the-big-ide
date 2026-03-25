export type SandboxMode = "docker" | "host";

export type RuntimeTarget = "electron" | "web";

export type PanelId = "projects" | "files" | "editor" | "terminal" | "agent" | "browser" | "git";

export interface DependencyReport {
  available: string[];
  missing: string[];
  checkedAt: string;
}

export interface SandboxRuntime {
  mode: SandboxMode;
  image: string | null;
  containerName: string | null;
  workdir: string;
  dependencies: DependencyReport;
  logs: string[];
}

export interface AgentRuntime {
  status: "running" | "missing-opencode" | "failed" | "stopped";
  port: number | null;
  command: string | null;
  message: string;
}

export interface Session {
  id: string;
  name: string;
  createdAt: string;
  status: "idle" | "running";
  agentStatus: AgentRuntime["status"];
  workdir: string;
  workspaceStrategy: "git-worktree" | "copy" | "empty";
  sandboxRuntime: SandboxRuntime | null;
  agentRuntime: AgentRuntime | null;
}

export interface SandboxConfig {
  mode: SandboxMode;
  image: string;
  command: string;
  dependencies: string[];
}

export interface Project {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  sandbox: SandboxConfig;
  sessions: Session[];
}

export interface DockerStatus {
  available: boolean;
  version: string;
  error: string;
}

export interface BootstrapPayload {
  runtimeTarget: RuntimeTarget;
  workspaceRoot: string;
  defaultSandbox: SandboxConfig;
  docker: DockerStatus;
  projects: Project[];
}

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

export interface GitStatusEntry {
  path: string;
  indexStatus: string;
  worktreeStatus: string;
  displayStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

export interface GitStatusSnapshot {
  isRepo: boolean;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: GitStatusEntry[];
  latestCommit: string | null;
}

export interface GitCommitResult {
  status: GitStatusSnapshot;
  output: string;
}

export interface BigIDEApi {
  bootstrap: () => Promise<BootstrapPayload>;
  projects: {
    list: () => Promise<Project[]>;
    create: (payload: {
      name: string;
      rootPath?: string;
      sandbox?: Partial<SandboxConfig>;
    }) => Promise<Project>;
    updateSandbox: (payload: {
      projectId: string;
      sandbox: Partial<SandboxConfig>;
    }) => Promise<Project>;
  };
  sessions: {
    create: (payload: { projectId: string; name?: string }) => Promise<Session>;
    start: (payload: { projectId: string; sessionId: string }) => Promise<Session>;
    stop: (payload: { projectId: string; sessionId: string }) => Promise<Session>;
  };
  fs: {
    readTree: (payload: { rootPath: string; maxDepth?: number }) => Promise<FileNode[]>;
    readFile: (payload: { filePath: string }) => Promise<string>;
    writeFile: (payload: { filePath: string; content: string }) => Promise<{ ok: true }>;
  };
  terminal: {
    start: (payload: { sessionId: string; cwd: string }) => Promise<{ alreadyRunning: boolean; shell?: string }>;
    write: (payload: { sessionId: string; data: string }) => Promise<{ ok: true }>;
    stop: (payload: { sessionId: string }) => Promise<{ ok: true }>;
    onData: (callback: (payload: { sessionId: string; data: string }) => void) => () => void;
    onExit: (
      callback: (payload: { sessionId: string; code: number | null; signal: NodeJS.Signals | null }) => void
    ) => () => void;
  };
  agent: {
    onLog: (callback: (payload: { sessionId: string; stream: "stdout" | "stderr"; chunk: string }) => void) => () => void;
    onStatus: (
      callback: (payload: { sessionId: string; status: string; code?: number | null; message?: string }) => void
    ) => () => void;
  };
  git: {
    status: (payload: { cwd: string }) => Promise<GitStatusSnapshot>;
    stage: (payload: { cwd: string; filePath?: string | null }) => Promise<GitStatusSnapshot>;
    discard: (payload: { cwd: string; filePath: string; untracked?: boolean }) => Promise<GitStatusSnapshot>;
    commit: (payload: { cwd: string; message: string }) => Promise<GitCommitResult>;
  };
}
