import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Play, RefreshCcw, Save, Square } from "lucide-react";

import { EditorPanel } from "@/components/editor-panel";
import { FileTree } from "@/components/file-tree";
import { TerminalPanel } from "@/components/terminal-panel";
import { cn } from "@/lib/utils";
import type { BootstrapPayload, FileNode, GitStatusEntry, GitStatusSnapshot, Project, Session } from "@/types/big-ide";

type SessionFilter = "all" | "active";

const PROJECTS_CHANGED_EVENT = "bigide:projects-changed";

type CompactPanelProps = {
  title: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
};

function CompactPanel({ title, children, className, actions }: CompactPanelProps) {
  return (
    <section className={cn("flex min-h-0 flex-col", className)}>
      <header className="flex items-center justify-between border-b border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]">
        <span>{title}</span>
        {actions ? <span className="flex items-center gap-1">{actions}</span> : null}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

function sessionTone(session: Session) {
  if (session.status === "running") {
    return "text-emerald-700";
  }
  if (session.agentStatus === "failed") {
    return "text-red-700";
  }
  if (session.agentStatus === "missing-opencode") {
    return "text-amber-700";
  }
  return "text-muted-foreground";
}

function normalizeWebUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "about:blank";
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(trimmed)) {
    return `http://${trimmed}`;
  }

  return `https://${trimmed}`;
}

export default function App() {
  const [boot, setBoot] = useState<BootstrapPayload | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const [treeNodes, setTreeNodes] = useState<FileNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);

  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [editorValue, setEditorValue] = useState("");
  const [editorDirty, setEditorDirty] = useState(false);

  const [newProjectName, setNewProjectName] = useState("The Big IDE");
  const [newSessionName, setNewSessionName] = useState("backend-debug");

  const [infoMessage, setInfoMessage] = useState("Initializing workspace...");
  const [errorMessage, setErrorMessage] = useState("");
  const [busyAction, setBusyAction] = useState(false);

  const [agentLogs, setAgentLogs] = useState<Record<string, string[]>>({});
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>("all");
  const [gitStatus, setGitStatus] = useState<GitStatusSnapshot | null>(null);
  const [selectedGitPath, setSelectedGitPath] = useState<string | null>(null);
  const [gitBusyAction, setGitBusyAction] = useState<"stage" | "discard" | "commit" | null>(null);

  const [webDraftUrl, setWebDraftUrl] = useState("http://localhost:3000");
  const [webUrl, setWebUrl] = useState("http://localhost:3000");
  const [webState, setWebState] = useState<"idle" | "loading" | "loaded" | "error">("idle");

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects]
  );

  const activeSession = useMemo(
    () => activeProject?.sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeProject, activeSessionId]
  );

  const activeAgentLogs = activeSession ? agentLogs[activeSession.id] ?? [] : [];

  const sidebarProjects = useMemo(() => {
    if (sessionFilter === "all") {
      return projects;
    }

    return projects
      .map((project) => ({
        ...project,
        sessions: project.sessions.filter((session) => session.status === "running")
      }))
      .filter((project) => project.sessions.length > 0 || project.id === activeProjectId);
  }, [activeProjectId, projects, sessionFilter]);

  const refreshProjects = useCallback(async () => {
    if (!window.bigIDE) {
      return;
    }

    const latest = await window.bigIDE.projects.list();
    setProjects(latest);
  }, []);

  const bootstrapWorkspace = useCallback(async () => {
    if (!window.bigIDE) {
      setErrorMessage("Big IDE API is not available. Start Electron or web backend.");
      return;
    }

    try {
      const payload = await window.bigIDE.bootstrap();
      setBoot(payload);
      setProjects(payload.projects);
      setInfoMessage(payload.runtimeTarget === "web" ? "Web runtime ready" : "Workspace ready");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to initialize workspace");
    }
  }, []);

  const reloadTree = useCallback(async () => {
    if (!window.bigIDE || !activeSession) {
      setTreeNodes([]);
      return;
    }

    setTreeLoading(true);
    try {
      const files = await window.bigIDE.fs.readTree({
        rootPath: activeSession.workdir,
        maxDepth: 5
      });
      setTreeNodes(files);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to read file tree");
    } finally {
      setTreeLoading(false);
    }
  }, [activeSession]);

  const openFile = useCallback(async (filePath: string) => {
    if (!window.bigIDE) {
      return;
    }

    try {
      const content = await window.bigIDE.fs.readFile({ filePath });
      setSelectedFilePath(filePath);
      setEditorValue(content);
      setEditorDirty(false);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to open file");
    }
  }, []);

  const saveFile = useCallback(async () => {
    if (!window.bigIDE || !selectedFilePath) {
      return;
    }

    try {
      setBusyAction(true);
      await window.bigIDE.fs.writeFile({
        filePath: selectedFilePath,
        content: editorValue
      });
      setEditorDirty(false);
      setInfoMessage(`Saved ${selectedFilePath}`);
      await reloadTree();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save file");
    } finally {
      setBusyAction(false);
    }
  }, [editorValue, reloadTree, selectedFilePath]);

  const createProject = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!window.bigIDE) {
        return;
      }

      const name = newProjectName.trim();
      if (!name) {
        return;
      }

      try {
        setBusyAction(true);
        const created = await window.bigIDE.projects.create({ name });
        setNewProjectName("");
        setActiveProjectId(created.id);
        setInfoMessage(`Project created: ${created.name}`);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to create project");
      } finally {
        setBusyAction(false);
      }
    },
    [newProjectName, refreshProjects]
  );

  const createSession = useCallback(async () => {
    if (!window.bigIDE || !activeProjectId) {
      return;
    }

      try {
        setBusyAction(true);
        const created = await window.bigIDE.sessions.create({
          projectId: activeProjectId,
          name: newSessionName.trim() || undefined
        });
        setNewSessionName("");
        setActiveSessionId(created.id);
        setInfoMessage(`Session created: ${created.name}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create session");
    } finally {
      setBusyAction(false);
    }
  }, [activeProjectId, newSessionName, refreshProjects]);

  const startSession = useCallback(async () => {
    if (!window.bigIDE || !activeProjectId || !activeSessionId) {
      return;
    }

      try {
        setBusyAction(true);
        await window.bigIDE.sessions.start({
          projectId: activeProjectId,
          sessionId: activeSessionId
        });
        setInfoMessage("Session started");
        setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to start session");
    } finally {
      setBusyAction(false);
    }
  }, [activeProjectId, activeSessionId, refreshProjects]);

  const stopSession = useCallback(async () => {
    if (!window.bigIDE || !activeProjectId || !activeSessionId) {
      return;
    }

      try {
        setBusyAction(true);
        await window.bigIDE.sessions.stop({
          projectId: activeProjectId,
          sessionId: activeSessionId
        });
        setInfoMessage("Session stopped");
        setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to stop session");
    } finally {
      setBusyAction(false);
    }
  }, [activeProjectId, activeSessionId, refreshProjects]);

  const cycleSession = useCallback(() => {
    if (!activeProject?.sessions.length) {
      return;
    }

    const sessions = activeProject.sessions;
    const currentIndex = sessions.findIndex((session) => session.id === activeSessionId);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % sessions.length;
    setActiveSessionId(sessions[nextIndex]?.id ?? null);
    setInfoMessage(`Switched to ${sessions[nextIndex]?.name ?? "session"}`);
  }, [activeProject, activeSessionId]);

  const chatLines = useMemo(() => activeAgentLogs.slice(-80), [activeAgentLogs]);

  const applyGitSnapshot = useCallback((snapshot: GitStatusSnapshot) => {
    setGitStatus(snapshot);
    setSelectedGitPath((currentPath) => {
      if (currentPath && snapshot.files.some((entry) => entry.path === currentPath)) {
        return currentPath;
      }
      return snapshot.files[0]?.path ?? null;
    });
  }, []);

  const selectedGitEntry = useMemo(() => {
    if (!gitStatus || !selectedGitPath) {
      return null;
    }

    return gitStatus.files.find((entry) => entry.path === selectedGitPath) ?? null;
  }, [gitStatus, selectedGitPath]);

  const hasStagedChanges = useMemo(() => Boolean(gitStatus?.files.some((entry) => entry.staged)), [gitStatus]);

  const refreshGitStatus = useCallback(async () => {
    if (!window.bigIDE || !activeSession) {
      setGitStatus(null);
      setSelectedGitPath(null);
      return;
    }

    try {
      const snapshot = await window.bigIDE.git.status({
        cwd: activeSession.workdir
      });
      applyGitSnapshot(snapshot);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load git status");
    }
  }, [activeSession, applyGitSnapshot]);

  const stageGitSelection = useCallback(async () => {
    if (!window.bigIDE || !activeSession) {
      return;
    }

    try {
      setGitBusyAction("stage");
      const snapshot = await window.bigIDE.git.stage({
        cwd: activeSession.workdir,
        filePath: selectedGitEntry?.path ?? null
      });
      applyGitSnapshot(snapshot);
      setInfoMessage(selectedGitEntry ? `Staged ${selectedGitEntry.path}` : "Staged all changes");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to stage git changes");
    } finally {
      setGitBusyAction(null);
    }
  }, [activeSession, applyGitSnapshot, selectedGitEntry]);

  const discardGitSelection = useCallback(async () => {
    if (!window.bigIDE || !activeSession || !selectedGitEntry) {
      return;
    }

    try {
      setGitBusyAction("discard");
      const snapshot = await window.bigIDE.git.discard({
        cwd: activeSession.workdir,
        filePath: selectedGitEntry.path,
        untracked: selectedGitEntry.untracked
      });
      applyGitSnapshot(snapshot);
      setInfoMessage(`Discarded ${selectedGitEntry.path}`);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to discard git changes");
    } finally {
      setGitBusyAction(null);
    }
  }, [activeSession, applyGitSnapshot, selectedGitEntry]);

  const commitGitChanges = useCallback(async () => {
    if (!window.bigIDE || !activeSession) {
      return;
    }

    const message = window.prompt("Commit message", `chore: update ${activeSession.name}`)?.trim();
    if (!message) {
      return;
    }

    try {
      setGitBusyAction("commit");
      const result = await window.bigIDE.git.commit({
        cwd: activeSession.workdir,
        message
      });
      applyGitSnapshot(result.status);
      const outputLine = result.output.split(/\r?\n/).find(Boolean);
      setInfoMessage(outputLine || "Commit created");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create commit");
    } finally {
      setGitBusyAction(null);
    }
  }, [activeSession, applyGitSnapshot]);

  const openWebView = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const normalized = normalizeWebUrl(webDraftUrl);
      setWebDraftUrl(normalized);
      setWebUrl(normalized);
      setWebState(normalized === "about:blank" ? "idle" : "loading");
    },
    [webDraftUrl]
  );

  useEffect(() => {
    void bootstrapWorkspace();
  }, [bootstrapWorkspace]);

  useEffect(() => {
    if (!projects.length) {
      setActiveProjectId(null);
      setActiveSessionId(null);
      return;
    }

    setActiveProjectId((previous) => {
      if (previous && projects.some((project) => project.id === previous)) {
        return previous;
      }
      return projects[0].id;
    });
  }, [projects]);

  useEffect(() => {
    if (!activeProject) {
      setActiveSessionId(null);
      return;
    }

    setActiveSessionId((previous) => {
      if (previous && activeProject.sessions.some((session) => session.id === previous)) {
        return previous;
      }
      return activeProject.sessions[0]?.id ?? null;
    });
  }, [activeProject]);

  useEffect(() => {
    setSelectedFilePath(null);
    setEditorValue("");
    setEditorDirty(false);
    void reloadTree();
    void refreshGitStatus();
  }, [activeSession?.id, refreshGitStatus, reloadTree]);

  useEffect(() => {
    if (!activeSession?.agentRuntime?.port) {
      return;
    }

    const sessionUrl = `http://127.0.0.1:${activeSession.agentRuntime.port}`;
    setWebDraftUrl(sessionUrl);
    setWebUrl(sessionUrl);
    setWebState("loading");
  }, [activeSession?.agentRuntime?.port]);

  useEffect(() => {
    if (!activeSession) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshGitStatus();
    }, 3500);

    return () => window.clearInterval(intervalId);
  }, [activeSession?.id, refreshGitStatus]);

  useEffect(() => {
    if (!window.bigIDE) {
      return;
    }

    const stopLog = window.bigIDE.agent.onLog((payload) => {
      const lines = payload.chunk
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter(Boolean)
        .map((line) => `[${payload.stream}] ${line}`);

      if (!lines.length) {
        return;
      }

      setAgentLogs((previous) => ({
        ...previous,
        [payload.sessionId]: [...(previous[payload.sessionId] ?? []), ...lines].slice(-300)
      }));
    });

    const stopStatus = window.bigIDE.agent.onStatus((payload) => {
      const statusLine = `[status] ${payload.status}${payload.message ? `: ${payload.message}` : ""}`;
      setAgentLogs((previous) => ({
        ...previous,
        [payload.sessionId]: [...(previous[payload.sessionId] ?? []), statusLine].slice(-300)
      }));
      void refreshProjects();
    });

    return () => {
      stopLog();
      stopStatus();
    };
  }, [refreshProjects]);

  useEffect(() => {
    const syncProjects = () => {
      void refreshProjects();
    };

    window.addEventListener(PROJECTS_CHANGED_EVENT, syncProjects);
    return () => window.removeEventListener(PROJECTS_CHANGED_EVENT, syncProjects);
  }, [refreshProjects]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if ((event.metaKey || event.ctrlKey) && key === "s") {
        event.preventDefault();
        void saveFile();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && key === "n") {
        event.preventDefault();
        void createSession();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && key === "tab") {
        event.preventDefault();
        cycleSession();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createSession, cycleSession, saveFile]);

  if (!window.bigIDE) {
    return (
      <main className="flex h-full items-center justify-center bg-background font-mono text-[11px]">
        <div className="border border-border px-3 py-2">Backend unavailable. Use npm run dev or npm run dev:web.</div>
      </main>
    );
  }

  return (
    <main className="h-full w-full overflow-hidden bg-background font-mono text-[11px] leading-tight text-foreground">
      <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="grid min-h-[180px] max-h-[38vh] grid-rows-[auto_auto_auto_1fr_auto] border-b border-border lg:min-h-0 lg:max-h-none lg:border-b-0 lg:border-r">
          <div className="border-b border-border px-2 py-1 font-semibold uppercase tracking-[0.08em]">Projects</div>

          <form className="grid grid-cols-[1fr_auto] border-b border-border" onSubmit={createProject}>
            <input
              data-testid="project-name-input"
              value={newProjectName}
              onChange={(event) => setNewProjectName(event.target.value)}
              placeholder="new project"
              className="h-7 w-full border-0 bg-transparent px-2 text-[11px] outline-none placeholder:text-muted-foreground"
            />
            <button
              data-testid="create-project-button"
              type="submit"
              disabled={busyAction || !newProjectName.trim()}
              className="h-7 border-l border-border px-2 text-[10px] uppercase tracking-[0.08em] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              +project
            </button>
          </form>

          <div className="grid grid-cols-[1fr_auto] border-b border-border">
            <input
              data-testid="session-name-input"
              value={newSessionName}
              onChange={(event) => setNewSessionName(event.target.value)}
              placeholder="backend-debug"
              className="h-7 w-full border-0 bg-transparent px-2 text-[11px] outline-none placeholder:text-muted-foreground"
            />
            <button
              data-testid="create-session-button"
              type="button"
              onClick={() => void createSession()}
              disabled={busyAction || !activeProjectId}
              className="h-7 border-l border-border px-2 text-[10px] uppercase tracking-[0.08em] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              +session
            </button>
          </div>

          <div className="min-h-0 overflow-auto">
            {!sidebarProjects.length ? (
              <div className="px-2 py-2 text-[10px] text-muted-foreground">No projects yet.</div>
            ) : null}

            {sidebarProjects.map((project) => {
              const isActiveProject = project.id === activeProjectId;
              return (
                <section key={project.id} className="border-b border-border">
                  <button
                    type="button"
                    className={cn("w-full truncate px-2 py-1 text-left uppercase", isActiveProject && "bg-muted")}
                    onClick={() => setActiveProjectId(project.id)}
                    title={project.rootPath}
                  >
                    {project.name}
                  </button>

                  {project.sessions.length ? (
                    project.sessions.map((session) => {
                      const isActiveSession = session.id === activeSessionId;
                      return (
                        <button
                          data-testid="session-row"
                          data-session-name={session.name}
                          data-session-status={session.status}
                          type="button"
                          key={session.id}
                          className={cn(
                            "flex w-full items-center gap-2 border-t border-border px-2 py-1 text-left",
                            isActiveSession && "bg-muted"
                          )}
                          onClick={() => {
                            setActiveProjectId(project.id);
                            setActiveSessionId(session.id);
                          }}
                        >
                          <span className={cn("size-1.5 shrink-0 rounded-full", session.status === "running" ? "bg-emerald-600" : "bg-muted-foreground")} />
                          <span className="truncate">{session.name}</span>
                          <span className={cn("ml-auto shrink-0 text-[10px] uppercase", sessionTone(session))}>{session.status}</span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="border-t border-border px-4 py-1 text-[10px] text-muted-foreground">no sessions</div>
                  )}
                </section>
              );
            })}
          </div>

          <div className="flex items-center justify-between border-t border-border px-2 py-1 text-[10px] uppercase tracking-[0.08em]">
            <span className="text-muted-foreground">Filter:</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={cn("px-1", sessionFilter === "all" ? "font-semibold text-foreground" : "text-muted-foreground")}
                onClick={() => setSessionFilter("all")}
              >
                all
              </button>
              <span className="text-muted-foreground">/</span>
              <button
                type="button"
                className={cn("px-1", sessionFilter === "active" ? "font-semibold text-foreground" : "text-muted-foreground")}
                onClick={() => setSessionFilter("active")}
              >
                active
              </button>
            </div>
          </div>
        </aside>

        <section className="grid min-h-0 grid-rows-[auto_1fr_auto]">
          <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]">
            <span data-testid="active-session-label" className="truncate">Session: {activeSession?.name ?? "none"}</span>
            <span className="shrink-0 text-[10px] font-normal text-muted-foreground">
              {boot?.runtimeTarget ?? "unknown"} / {boot?.docker.available ? "docker:ok" : "docker:off"}
            </span>
          </div>

          <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="min-h-0 overflow-x-auto border-b border-border">
              <div className="grid h-full min-w-[980px] grid-cols-4">
                <CompactPanel
                  title="FILE TREE"
                  className="border-r border-border"
                  actions={
                    <button type="button" onClick={() => void reloadTree()} className="hover:text-foreground/80" aria-label="Refresh file tree">
                      <RefreshCcw className="size-3" />
                    </button>
                  }
                >
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="border-b border-border px-2 py-1 text-[10px] text-muted-foreground">
                      {activeSession?.workdir ?? "no session"}
                    </div>
                    <div className="min-h-0 flex-1">
                      <FileTree
                        nodes={treeNodes}
                        selectedFilePath={selectedFilePath}
                        onOpenFile={(path) => void openFile(path)}
                        isLoading={treeLoading}
                      />
                    </div>
                  </div>
                </CompactPanel>

                <CompactPanel title="CHAT / AGENT" className="border-r border-border">
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="min-h-0 flex-1 overflow-auto">
                      {chatLines.length ? (
                        chatLines.map((line, index) => (
                          <div
                            key={`${line}-${index}`}
                            className={cn(
                              "border-b border-border px-2 py-1 whitespace-pre-wrap break-words",
                              line.startsWith("[status]") && "text-muted-foreground",
                              line.includes("[stderr]") && "text-red-700"
                            )}
                          >
                            {line}
                          </div>
                        ))
                      ) : (
                        <div className="border-b border-border px-2 py-1 text-[10px] text-muted-foreground">no agent logs yet</div>
                      )}
                    </div>
                    <div className="grid grid-cols-3 border-t border-border text-[10px] uppercase tracking-[0.08em]">
                      <button
                        data-testid="start-session-button"
                        type="button"
                        onClick={() => void startSession()}
                        disabled={busyAction || !activeSessionId}
                        className="flex items-center justify-center gap-1 border-r border-border py-1 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Play className="size-3" /> start
                      </button>
                      <button
                        data-testid="stop-session-button"
                        type="button"
                        onClick={() => void stopSession()}
                        disabled={busyAction || !activeSessionId}
                        className="flex items-center justify-center gap-1 border-r border-border py-1 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Square className="size-3" /> stop
                      </button>
                      <button
                        data-testid="quick-new-session-button"
                        type="button"
                        onClick={() => void createSession()}
                        disabled={busyAction || !activeProjectId}
                        className="py-1 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        new
                      </button>
                    </div>
                  </div>
                </CompactPanel>

                <CompactPanel title="TERMINAL" className="border-r border-border">
                  <TerminalPanel session={activeSession} />
                </CompactPanel>

                <CompactPanel
                  title="GIT"
                  actions={
                    <button
                      data-testid="refresh-git-button"
                      type="button"
                      onClick={() => void refreshGitStatus()}
                      className="hover:text-foreground/80"
                      aria-label="Refresh git status"
                    >
                      <RefreshCcw className="size-3" />
                    </button>
                  }
                >
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="min-h-0 flex-1 overflow-auto">
                      {!activeSession ? (
                        <div className="border-b border-border px-2 py-1 text-[10px] text-muted-foreground">no session selected</div>
                      ) : !gitStatus ? (
                        <div className="border-b border-border px-2 py-1 text-[10px] text-muted-foreground">loading git status...</div>
                      ) : !gitStatus.isRepo ? (
                        <div className="border-b border-border px-2 py-1 text-[10px] text-muted-foreground">workspace is not a git repository</div>
                      ) : (
                        <>
                          <div className="border-b border-border px-2 py-1">branch: {gitStatus.branch ?? "detached"}</div>
                          <div className="border-b border-border px-2 py-1 text-[10px] text-muted-foreground">
                            sync: +{gitStatus.ahead} / -{gitStatus.behind}
                          </div>
                          {gitStatus.files.length ? (
                            gitStatus.files.map((entry: GitStatusEntry, index) => (
                              <button
                                data-testid="git-file-row"
                                data-git-path={entry.path}
                                type="button"
                                key={`${entry.path}-${index}`}
                                onClick={() => setSelectedGitPath(entry.path)}
                                className={cn(
                                  "flex w-full items-center gap-2 border-b border-border px-2 py-1 text-left hover:bg-muted",
                                  selectedGitPath === entry.path && "bg-muted"
                                )}
                              >
                                <span className="shrink-0">{entry.displayStatus}:</span>
                                <span className="truncate">{entry.path}</span>
                              </button>
                            ))
                          ) : (
                            <div className="border-b border-border px-2 py-1 text-[10px] text-muted-foreground">working tree clean</div>
                          )}
                          <div className="border-b border-border px-2 py-1 text-[10px] text-muted-foreground">
                            commit: {gitStatus.latestCommit ?? "no commits yet"}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="grid grid-cols-3 border-t border-border text-[10px] uppercase tracking-[0.08em]">
                      <button
                        data-testid="git-stage-button"
                        type="button"
                        onClick={() => void stageGitSelection()}
                        disabled={
                          gitBusyAction !== null ||
                          !activeSession ||
                          !gitStatus?.isRepo ||
                          !gitStatus.files.length
                        }
                        className="border-r border-border py-1 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        [stage]
                      </button>
                      <button
                        data-testid="git-discard-button"
                        type="button"
                        onClick={() => void discardGitSelection()}
                        disabled={gitBusyAction !== null || !selectedGitEntry}
                        className="border-r border-border py-1 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        [discard]
                      </button>
                      <button
                        data-testid="git-commit-button"
                        type="button"
                        onClick={() => void commitGitChanges()}
                        disabled={gitBusyAction !== null || !activeSession || !gitStatus?.isRepo || !hasStagedChanges}
                        className="py-1 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        [commit]
                      </button>
                    </div>
                  </div>
                </CompactPanel>
              </div>
            </div>

            <div className="min-h-0 overflow-x-auto">
              <div className="grid h-full min-w-[860px] grid-cols-3">
                <CompactPanel title="WEB VIEW" className="border-r border-border">
                  <div className="flex h-full min-h-0 flex-col">
                    <form className="grid grid-cols-[1fr_auto] border-b border-border" onSubmit={openWebView}>
                      <input
                        data-testid="web-url-input"
                        value={webDraftUrl}
                        onChange={(event) => setWebDraftUrl(event.target.value)}
                        placeholder="http://localhost:3000"
                        className="h-7 w-full border-0 bg-transparent px-2 text-[11px] outline-none placeholder:text-muted-foreground"
                      />
                      <button
                        data-testid="web-open-button"
                        type="submit"
                        className="h-7 border-l border-border px-2 text-[10px] uppercase tracking-[0.08em] hover:bg-muted"
                      >
                        open
                      </button>
                    </form>
                    <div data-testid="web-status" className="border-b border-border px-2 py-1 text-[10px] text-muted-foreground">
                      status: {webState}
                    </div>
                    {webUrl === "about:blank" ? (
                      <div className="flex min-h-0 flex-1 items-center justify-center px-2 text-[10px] text-muted-foreground">enter url</div>
                    ) : (
                      <iframe
                        data-testid="web-iframe"
                        src={webUrl}
                        title="Live web view"
                        className="min-h-0 flex-1 border-0 bg-white"
                        onLoad={() => setWebState("loaded")}
                        onError={() => setWebState("error")}
                      />
                    )}
                  </div>
                </CompactPanel>

                <CompactPanel
                  title="FILE VIEW"
                  className="border-r border-border"
                  actions={
                    <button
                      type="button"
                      onClick={() => void saveFile()}
                      disabled={!selectedFilePath || busyAction}
                      className="hover:text-foreground/80 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Save file"
                    >
                      <Save className="size-3" />
                    </button>
                  }
                >
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="border-b border-border px-2 py-1 text-[10px] text-muted-foreground">
                      {selectedFilePath ?? "// no file selected"}
                    </div>
                    <div className="min-h-0 flex-1">
                      <EditorPanel
                        filePath={selectedFilePath}
                        value={editorValue}
                        onChange={(value) => {
                          setEditorValue(value);
                          setEditorDirty(true);
                        }}
                      />
                    </div>
                  </div>
                </CompactPanel>

                <CompactPanel title="TERMINAL 2">
                  <TerminalPanel session={activeSession} />
                </CompactPanel>
              </div>
            </div>
          </div>

          <footer className="flex items-center gap-1 overflow-x-auto border-t border-border px-2 py-1 text-[10px] uppercase tracking-[0.08em]">
            <span className="shrink-0 text-muted-foreground">Horizontal panel strip -&gt;</span>
            {(["tree", "chat", "term", "git", "web", "file", "term"] as const).map((item, index) => (
              <button key={`${item}-${index}`} type="button" className="shrink-0 px-1 hover:bg-muted">
                [{item}]
              </button>
            ))}
            <span className={cn("ml-auto shrink-0 px-1", errorMessage ? "text-red-700" : "text-muted-foreground")}>
              {errorMessage || infoMessage}
            </span>
          </footer>
        </section>
      </div>
    </main>
  );
}
