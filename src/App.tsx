import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  FolderPlus,
  FolderTree,
  GitBranch,
  GitCommitHorizontal,
  Globe,
  Play,
  RefreshCcw,
  Save,
  Square,
  TerminalSquare
} from "lucide-react";

import { EditorPanel } from "@/components/editor-panel";
import { FileTree } from "@/components/file-tree";
import { TerminalPanel } from "@/components/terminal-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { BootstrapPayload, FileNode, GitStatusEntry, GitStatusSnapshot, Project, Session } from "@/types/big-ide";

type SessionFilter = "all" | "active";
type BadgeVariant = "default" | "secondary" | "outline" | "success" | "warning" | "danger";

const PROJECTS_CHANGED_EVENT = "bigide:projects-changed";

type WorkspaceCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
  contentClassName?: string;
};

function WorkspaceCard({ title, description, children, className, actions, contentClassName }: WorkspaceCardProps) {
  return (
    <Card className={cn("flex min-h-0 flex-col overflow-hidden border-border/70 bg-card/90 shadow-lg", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 border-b border-border/60 pb-4">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </CardHeader>
      <CardContent className={cn("min-h-0 flex-1", contentClassName)}>{children}</CardContent>
    </Card>
  );
}

function sessionStatusVariant(session: Session): BadgeVariant {
  if (session.status === "running") {
    return "success";
  }
  if (session.agentStatus === "failed") {
    return "danger";
  }
  if (session.agentStatus === "missing-opencode") {
    return "warning";
  }
  return "secondary";
}

function agentStatusVariant(status: Session["agentStatus"]): BadgeVariant {
  if (status === "running") {
    return "success";
  }
  if (status === "failed") {
    return "danger";
  }
  if (status === "missing-opencode") {
    return "warning";
  }
  return "outline";
}

function gitEntryClass(entry: GitStatusEntry) {
  if (entry.untracked) {
    return "text-amber-900";
  }
  if (entry.staged) {
    return "text-emerald-900";
  }
  return "text-foreground";
}

function formatAgentStatus(status: Session["agentStatus"]) {
  return status.replace(/-/g, " ");
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
  const [isCommitDialogOpen, setIsCommitDialogOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");

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
        await refreshProjects();
        setNewProjectName("");
        setActiveProjectId(created.id);
        setInfoMessage(`Project created: ${created.name}`);
        setErrorMessage("");
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
        await refreshProjects();
        setNewSessionName("");
        setActiveSessionId(created.id);
        setInfoMessage(`Session created: ${created.name}`);
        setErrorMessage("");
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
        await refreshProjects();
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
        await refreshProjects();
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

    const message = commitMessage.trim();
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
      setIsCommitDialogOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create commit");
    } finally {
      setGitBusyAction(null);
    }
  }, [activeSession, applyGitSnapshot, commitMessage]);

  const openCommitDialog = useCallback(() => {
    if (!activeSession) {
      return;
    }

    setCommitMessage((currentMessage) => currentMessage || `chore: update ${activeSession.name}`);
    setIsCommitDialogOpen(true);
  }, [activeSession]);

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
      <main className="flex h-full items-center justify-center bg-background p-6 font-sans">
        <Card className="max-w-lg border-border/70 bg-background/90 shadow-xl">
          <CardHeader>
            <CardTitle>Backend unavailable</CardTitle>
            <CardDescription>Use `npm run dev` or `npm run dev:web` to connect the workspace runtime.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="h-full overflow-hidden text-foreground">
      <div className="glass-grid flex h-full min-h-0 flex-col gap-4 overflow-auto p-4">
        <Card className="border-border/70 bg-background/85 shadow-xl backdrop-blur-md">
          <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-primary">The Big IDE</p>
              <h1 className="text-3xl font-semibold tracking-tight">Shadcn workspace cockpit</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Manage projects, sessions, code, git state, and browser previews from one responsive control surface.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{boot?.runtimeTarget ?? "unknown"}</Badge>
              <Badge variant={boot?.docker.available ? "success" : "warning"}>
                {boot?.docker.available ? `docker ${boot?.docker.version || "ready"}` : "docker unavailable"}
              </Badge>
              <Badge variant={activeSession ? sessionStatusVariant(activeSession) : "secondary"}>
                {activeSession ? activeSession.status : "no active session"}
              </Badge>
              {activeSession ? <Badge variant={agentStatusVariant(activeSession.agentStatus)}>agent {formatAgentStatus(activeSession.agentStatus)}</Badge> : null}
            </div>
          </CardContent>
        </Card>

        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <WorkspaceCard
            title="Projects"
            description="Create projects, spin up sessions, and filter the workspace list."
            className="min-h-[36rem] xl:min-h-0"
            contentClassName="flex min-h-0 flex-1 flex-col gap-4"
          >
            <form className="grid gap-3" onSubmit={createProject}>
              <div className="grid gap-2">
                <Input
                  data-testid="project-name-input"
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  placeholder="New project"
                />
                <Button data-testid="create-project-button" type="submit" disabled={busyAction || !newProjectName.trim()}>
                  <FolderPlus className="mr-2 size-4" />
                  Create project
                </Button>
              </div>
            </form>

            <div className="grid gap-2">
              <Input
                data-testid="session-name-input"
                value={newSessionName}
                onChange={(event) => setNewSessionName(event.target.value)}
                placeholder="backend-debug"
              />
              <Button
                data-testid="create-session-button"
                type="button"
                variant="secondary"
                onClick={() => void createSession()}
                disabled={busyAction || !activeProjectId}
              >
                Create session
              </Button>
            </div>

            <Tabs value={sessionFilter} onValueChange={(value) => setSessionFilter(value as SessionFilter)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="all">All sessions</TabsTrigger>
                <TabsTrigger value="active">Running only</TabsTrigger>
              </TabsList>
            </Tabs>

            <ScrollArea className="min-h-0 flex-1 rounded-xl border border-border/60 bg-background/60">
              <div className="space-y-3 p-3">
                {!sidebarProjects.length ? <p className="text-sm text-muted-foreground">No projects yet.</p> : null}

                {sidebarProjects.map((project) => {
                  const isActiveProject = project.id === activeProjectId;

                  return (
                    <section key={project.id} className="rounded-xl border border-border/60 bg-card/60 shadow-sm">
                      <div className="flex items-start justify-between gap-3 p-3">
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            className={cn(
                              "block max-w-full truncate text-left text-sm font-semibold transition-colors hover:text-primary",
                              isActiveProject && "text-primary"
                            )}
                            onClick={() => setActiveProjectId(project.id)}
                            title={project.rootPath}
                          >
                            {project.name}
                          </button>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{project.rootPath}</p>
                        </div>
                        <Badge variant="outline">{project.sessions.length}</Badge>
                      </div>

                      <div className="space-y-1 border-t border-border/60 p-2">
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
                                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/70",
                                  isActiveSession && "bg-primary/10 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.14)]"
                                )}
                                onClick={() => {
                                  setActiveProjectId(project.id);
                                  setActiveSessionId(session.id);
                                }}
                              >
                                <span className={cn("size-2 shrink-0 rounded-full", session.status === "running" ? "bg-emerald-500" : "bg-muted-foreground")} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium">{session.name}</span>
                                  <span className="block truncate text-xs text-muted-foreground">{formatAgentStatus(session.agentStatus)}</span>
                                </span>
                                <Badge variant={sessionStatusVariant(session)}>{session.status}</Badge>
                              </button>
                            );
                          })
                        ) : (
                          <div className="rounded-lg px-3 py-2 text-sm text-muted-foreground">No sessions yet.</div>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            </ScrollArea>
          </WorkspaceCard>

          <section className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)_minmax(0,1fr)]">
            <div className="grid min-h-0 gap-4 lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
              <WorkspaceCard
                title="File tree"
                description={activeSession?.workdir ?? "Select a session to load a workspace tree."}
                contentClassName="min-h-0 p-0"
                actions={
                  <Button type="button" variant="ghost" size="icon" onClick={() => void reloadTree()} aria-label="Refresh file tree">
                    <RefreshCcw className="size-4" />
                  </Button>
                }
              >
                <div className="h-full min-h-[18rem] lg:min-h-0">
                  <FileTree
                    nodes={treeNodes}
                    selectedFilePath={selectedFilePath}
                    onOpenFile={(path) => void openFile(path)}
                    isLoading={treeLoading}
                  />
                </div>
              </WorkspaceCard>

              <WorkspaceCard
                title="Agent activity"
                description="Stream logs and inspect runtime state for the active session."
                contentClassName="flex min-h-0 flex-col"
              >
                <Tabs defaultValue="logs" className="flex min-h-0 flex-1 flex-col">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="logs">Logs</TabsTrigger>
                    <TabsTrigger value="runtime">Runtime</TabsTrigger>
                  </TabsList>

                  <TabsContent value="logs" className="min-h-0 flex-1">
                    <ScrollArea className="h-full rounded-xl border border-border/60 bg-background/60">
                      <div className="space-y-2 p-3">
                        {chatLines.length ? (
                          chatLines.map((line, index) => (
                            <div
                              key={`${line}-${index}`}
                              className={cn(
                                "rounded-lg border border-border/60 bg-card/70 px-3 py-2 text-xs leading-relaxed text-foreground/90",
                                line.startsWith("[status]") && "text-muted-foreground",
                                line.includes("[stderr]") && "border-red-200 bg-red-50/70 text-red-900"
                              )}
                            >
                              {line}
                            </div>
                          ))
                        ) : (
                          <div className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
                            No agent logs yet.
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="runtime" className="min-h-0 flex-1">
                    <ScrollArea className="h-full rounded-xl border border-border/60 bg-background/60">
                      <div className="space-y-4 p-4 text-sm">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Bot className="size-4 text-primary" />
                            <span className="font-medium">Agent</span>
                            <Badge variant={agentStatusVariant(activeSession?.agentStatus ?? "stopped")}>{activeSession ? formatAgentStatus(activeSession.agentStatus) : "stopped"}</Badge>
                          </div>
                          <p className="text-muted-foreground">{activeSession?.agentRuntime?.message || "Agent details appear when a session is active."}</p>
                        </div>

                        <Separator />

                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Activity className="size-4 text-primary" />
                            <span className="font-medium">Sandbox</span>
                            <Badge variant="outline">{activeSession?.sandboxRuntime?.mode ?? activeProject?.sandbox.mode ?? "unknown"}</Badge>
                          </div>
                          <p className="text-muted-foreground">{activeSession?.workdir ?? "No session selected."}</p>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Dependencies</p>
                          {activeSession?.sandboxRuntime?.dependencies.missing.length ? (
                            <div className="space-y-2">
                              {activeSession.sandboxRuntime.dependencies.missing.map((dependency) => (
                                <Badge key={dependency} variant="warning" className="mr-2">{dependency}</Badge>
                              ))}
                            </div>
                          ) : (
                            <p className="text-muted-foreground">No missing sandbox dependencies reported.</p>
                          )}
                        </div>
                      </div>
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              </WorkspaceCard>
            </div>

            <div className="grid min-h-0 gap-4 lg:grid-rows-[auto_minmax(0,1fr)_280px]">
              <WorkspaceCard title="Session controls" description="Start, stop, and monitor the current workspace session.">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span data-testid="active-session-label" className="text-lg font-semibold tracking-tight">
                      Session: {activeSession?.name ?? "none"}
                    </span>
                    {activeProject ? <Badge variant="outline">{activeProject.name}</Badge> : null}
                    {activeSession ? <Badge variant={sessionStatusVariant(activeSession)}>{activeSession.status}</Badge> : null}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <Button data-testid="start-session-button" type="button" onClick={() => void startSession()} disabled={busyAction || !activeSessionId}>
                      <Play className="mr-2 size-4" />
                      Start
                    </Button>
                    <Button
                      data-testid="stop-session-button"
                      type="button"
                      variant="secondary"
                      onClick={() => void stopSession()}
                      disabled={busyAction || !activeSessionId}
                    >
                      <Square className="mr-2 size-4" />
                      Stop
                    </Button>
                    <Button
                      data-testid="quick-new-session-button"
                      type="button"
                      variant="outline"
                      onClick={() => void createSession()}
                      disabled={busyAction || !activeProjectId}
                    >
                      Create next
                    </Button>
                  </div>

                  <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                    <div className="rounded-xl border border-border/60 bg-background/60 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em]">Runtime</p>
                      <p className="mt-2">{boot?.runtimeTarget ?? "unknown"}</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background/60 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em]">Docker</p>
                      <p className="mt-2">{boot?.docker.available ? "Available" : "Unavailable"}</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background/60 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em]">Workspace</p>
                      <p className="mt-2 truncate">{activeSession?.workdir ?? boot?.workspaceRoot ?? "n/a"}</p>
                    </div>
                  </div>
                </div>
              </WorkspaceCard>

              <WorkspaceCard
                title="Editor"
                description={selectedFilePath ?? "Pick a file from the tree to start editing."}
                contentClassName="flex min-h-0 flex-col p-0"
                actions={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void saveFile()}
                    disabled={!selectedFilePath || busyAction}
                    aria-label="Save file"
                  >
                    <Save className="size-4" />
                  </Button>
                }
              >
                <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 text-sm">
                  <span className="truncate text-muted-foreground">{selectedFilePath ?? "No file selected"}</span>
                  {selectedFilePath ? <Badge variant={editorDirty ? "warning" : "outline"}>{editorDirty ? "unsaved" : "saved"}</Badge> : null}
                </div>
                <div className="min-h-0 flex-1 bg-background/50 p-3">
                  <div className="h-full overflow-hidden rounded-xl border border-border/60 bg-card/70">
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
              </WorkspaceCard>

              <WorkspaceCard title="Terminal" description="Interactive shell bound to the active session." contentClassName="min-h-0 p-3 pt-0">
                <div className="h-full min-h-[16rem] overflow-hidden rounded-xl border border-border/60 bg-[#f8f4ea]">
                  <TerminalPanel session={activeSession} />
                </div>
              </WorkspaceCard>
            </div>

            <div className="grid min-h-0 gap-4 lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
              <WorkspaceCard
                title="Git"
                description="Track branch state, review changes, and prepare commits."
                contentClassName="flex min-h-0 flex-col"
                actions={
                  <Button
                    data-testid="refresh-git-button"
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void refreshGitStatus()}
                    aria-label="Refresh git status"
                  >
                    <RefreshCcw className="size-4" />
                  </Button>
                }
              >
                {!activeSession ? (
                  <div className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">No session selected.</div>
                ) : !gitStatus ? (
                  <div className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">Loading git status...</div>
                ) : !gitStatus.isRepo ? (
                  <div className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">Workspace is not a git repository.</div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2 pb-4">
                      <Badge variant="outline">
                        <GitBranch className="mr-1 size-3.5" />
                        {gitStatus.branch ?? "detached"}
                      </Badge>
                      <Badge variant="secondary">+{gitStatus.ahead} / -{gitStatus.behind}</Badge>
                      {selectedGitEntry ? <Badge variant={selectedGitEntry.staged ? "success" : selectedGitEntry.untracked ? "warning" : "outline"}>{selectedGitEntry.displayStatus}</Badge> : null}
                    </div>

                    <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border/60 bg-background/60 p-3">
                      <div className="space-y-2">
                        {gitStatus.files.length ? (
                          gitStatus.files.map((entry, index) => (
                            <button
                              data-testid="git-file-row"
                              data-git-path={entry.path}
                              type="button"
                              key={`${entry.path}-${index}`}
                              onClick={() => setSelectedGitPath(entry.path)}
                              className={cn(
                                "flex w-full items-center gap-3 rounded-lg border border-border/50 bg-card/70 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/70",
                                selectedGitPath === entry.path && "bg-primary/10 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.14)]",
                                gitEntryClass(entry)
                              )}
                            >
                              <Badge variant={entry.staged ? "success" : entry.untracked ? "warning" : "outline"} className="shrink-0">
                                {entry.displayStatus}
                              </Badge>
                              <span className="truncate">{entry.path}</span>
                            </button>
                          ))
                        ) : (
                          <div className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">Working tree clean.</div>
                        )}
                      </div>
                    </div>

                    <div className="pt-4 text-xs text-muted-foreground">Latest commit: {gitStatus.latestCommit ?? "no commits yet"}</div>
                    <div className="grid gap-2 pt-4 sm:grid-cols-3">
                      <Button
                        data-testid="git-stage-button"
                        type="button"
                        variant="secondary"
                        onClick={() => void stageGitSelection()}
                        disabled={gitBusyAction !== null || !activeSession || !gitStatus.files.length}
                      >
                        Stage
                      </Button>
                      <Button
                        data-testid="git-discard-button"
                        type="button"
                        variant="outline"
                        onClick={() => void discardGitSelection()}
                        disabled={gitBusyAction !== null || !selectedGitEntry}
                      >
                        Discard
                      </Button>
                      <Button
                        data-testid="git-commit-button"
                        type="button"
                        onClick={openCommitDialog}
                        disabled={gitBusyAction !== null || !activeSession || !gitStatus.isRepo || !hasStagedChanges}
                      >
                        <GitCommitHorizontal className="mr-2 size-4" />
                        Commit
                      </Button>
                    </div>
                  </>
                )}
              </WorkspaceCard>

              <WorkspaceCard title="Web preview" description="Open local or remote targets inside the workspace.">
                <div className="flex h-full min-h-0 flex-col gap-3">
                  <form className="flex gap-2" onSubmit={openWebView}>
                    <Input
                      data-testid="web-url-input"
                      value={webDraftUrl}
                      onChange={(event) => setWebDraftUrl(event.target.value)}
                      placeholder="http://localhost:3000"
                    />
                    <Button data-testid="web-open-button" type="submit">
                      <Globe className="mr-2 size-4" />
                      Open
                    </Button>
                  </form>

                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setWebDraftUrl("http://localhost:3000")}>localhost:3000</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setWebDraftUrl("http://127.0.0.1:43111/api/health")}>health</Button>
                  </div>

                  <div data-testid="web-status" className="text-sm text-muted-foreground">status: {webState}</div>

                  {webUrl === "about:blank" ? (
                    <div className="flex min-h-[16rem] flex-1 items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/60 px-4 text-sm text-muted-foreground">
                      Enter a URL to load a preview.
                    </div>
                  ) : (
                    <div className="min-h-[18rem] flex-1 overflow-hidden rounded-xl border border-border/60 bg-white shadow-inner">
                      <iframe
                        data-testid="web-iframe"
                        src={webUrl}
                        title="Live web view"
                        className="h-full w-full border-0 bg-white"
                        onLoad={() => setWebState("loaded")}
                        onError={() => setWebState("error")}
                      />
                    </div>
                  )}
                </div>
              </WorkspaceCard>
            </div>
          </section>
        </div>

        <Card className="border-border/70 bg-background/80 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-muted-foreground">
              <TerminalSquare className="size-4" />
              <span>{boot?.workspaceRoot ?? "workspace unavailable"}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">Ctrl/Cmd+S save</Badge>
              <Badge variant="outline">Ctrl/Cmd+Shift+N new session</Badge>
              <Badge variant="outline">Ctrl/Cmd+Tab cycle</Badge>
            </div>
            <div className={cn("text-sm", errorMessage ? "text-red-700" : "text-muted-foreground")}>{errorMessage || infoMessage}</div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isCommitDialogOpen} onOpenChange={setIsCommitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create commit</DialogTitle>
            <DialogDescription>Use a concise message that explains why the staged changes belong together.</DialogDescription>
          </DialogHeader>

          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void commitGitChanges();
            }}
          >
            <Input value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} placeholder="chore: update session state" />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCommitDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={gitBusyAction === "commit" || !commitMessage.trim()}>
                Create commit
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
