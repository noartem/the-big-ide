import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, GitBranch, GitCommitHorizontal, Globe, GripHorizontal, Play, RefreshCcw, Save, Square, X } from "lucide-react";

import { AgentPanel } from "@/components/agent-panel";
import { EditorPanel } from "@/components/editor-panel";
import { FileTree } from "@/components/file-tree";
import { TerminalPanel } from "@/components/terminal-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PanelShell } from "@/components/ui/panel-shell";
import { cn } from "@/lib/utils";
import type { BootstrapPayload, FileNode, GitStatusEntry, GitStatusSnapshot, PanelId, Project, Session } from "@/types/big-ide";

const PROJECTS_CHANGED_EVENT = "bigide:projects-changed";
const DEFAULT_BROWSER_URL = "http://localhost:3000";

type BadgeVariant = "default" | "secondary" | "outline" | "success" | "warning" | "danger";
type SessionPanelKind = Exclude<PanelId, "projects">;
type EditorBuffer = { value: string; dirty: boolean };
type SessionEditorState = {
  buffers: Record<string, EditorBuffer>;
};
type SessionPanelInstance = {
  id: string;
  kind: SessionPanelKind;
  filePath: string | null;
};

const PANEL_LABELS: Record<SessionPanelKind, string> = {
  agent: "Agent",
  files: "Files",
  editor: "Editor",
  terminal: "Terminal",
  git: "Git",
  browser: "Browser"
};

const NEW_PANEL_OPTIONS: Array<{ kind: SessionPanelKind; label: string; description: string }> = [
  { kind: "agent", label: "Agent", description: "Add another OpenCode surface." },
  { kind: "files", label: "Files", description: "Browse the workspace tree in a separate panel." },
  { kind: "terminal", label: "Terminal", description: "Open another terminal view for the session." },
  { kind: "git", label: "Git", description: "Inspect git state in an additional panel." },
  { kind: "browser", label: "Browser", description: "Open another preview/browser panel." }
];

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

function createEmptyEditorState(): SessionEditorState {
  return {
    buffers: {}
  };
}

function createPanelInstance(kind: SessionPanelKind, filePath: string | null = null): SessionPanelInstance {
  const id = globalThis.crypto?.randomUUID?.() ?? `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { id, kind, filePath };
}

function createDefaultPanels() {
  return [createPanelInstance("agent")];
}

function getAgentChatUrl(session: Session | null) {
  if (!session?.agentRuntime?.port) {
    return null;
  }

  return `http://127.0.0.1:${session.agentRuntime.port}`;
}

function fileLabel(filePath: string) {
  return filePath.split("/").filter(Boolean).pop() ?? filePath;
}

function toRelativePathLabel(basePath: string | null | undefined, targetPath: string | null | undefined, rootLabel = "./") {
  if (!targetPath) {
    return "";
  }

  if (!basePath) {
    return targetPath;
  }

  const normalizedBase = basePath.replace(/\/+$/, "");
  const normalizedTarget = targetPath.replace(/\/+$/, "");

  if (normalizedTarget === normalizedBase) {
    return rootLabel;
  }

  if (normalizedTarget.startsWith(`${normalizedBase}/`)) {
    return normalizedTarget.slice(normalizedBase.length + 1);
  }

  return targetPath;
}

function movePanel<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export default function App() {
  const [boot, setBoot] = useState<BootstrapPayload | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [panelInstancesBySession, setPanelInstancesBySession] = useState<Record<string, SessionPanelInstance[]>>({});
  const [focusedPanelIdBySession, setFocusedPanelIdBySession] = useState<Record<string, string | null>>({});
  const [selectedFilePathBySession, setSelectedFilePathBySession] = useState<Record<string, string | null>>({});

  const [treeNodes, setTreeNodes] = useState<FileNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [editorStateBySession, setEditorStateBySession] = useState<Record<string, SessionEditorState>>({});

  const [newProjectName, setNewProjectName] = useState("");
  const [newSessionName, setNewSessionName] = useState("");
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [isSessionDialogOpen, setIsSessionDialogOpen] = useState(false);
  const [sessionCreationProjectId, setSessionCreationProjectId] = useState<string | null>(null);
  const [isPanelDialogOpen, setIsPanelDialogOpen] = useState(false);
  const [draggedPanelId, setDraggedPanelId] = useState<string | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

  const [infoMessage, setInfoMessage] = useState("Initializing workspace...");
  const [errorMessage, setErrorMessage] = useState("");
  const [busyAction, setBusyAction] = useState(false);

  const [gitStatus, setGitStatus] = useState<GitStatusSnapshot | null>(null);
  const [selectedGitPath, setSelectedGitPath] = useState<string | null>(null);
  const [gitBusyAction, setGitBusyAction] = useState<"stage" | "discard" | "commit" | null>(null);
  const [isCommitDialogOpen, setIsCommitDialogOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");

  const [webDraftUrl, setWebDraftUrl] = useState(DEFAULT_BROWSER_URL);
  const [webUrl, setWebUrl] = useState("about:blank");
  const [webState, setWebState] = useState<"idle" | "loading" | "loaded" | "error">("idle");

  const panelRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects]
  );

  const activeSession = useMemo(
    () => activeProject?.sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeProject, activeSessionId]
  );

  const activePanels = useMemo(
    () => (activeSession ? panelInstancesBySession[activeSession.id] ?? [] : []),
    [activeSession, panelInstancesBySession]
  );

  const activeFocusedPanelId = useMemo(() => {
    if (!activeSession) {
      return null;
    }

    const focused = focusedPanelIdBySession[activeSession.id];
    if (focused && activePanels.some((panel) => panel.id === focused)) {
      return focused;
    }

    return activePanels[0]?.id ?? null;
  }, [activePanels, activeSession, focusedPanelIdBySession]);

  const activeSelectedFilePath = useMemo(() => {
    if (!activeSession) {
      return null;
    }

    return selectedFilePathBySession[activeSession.id] ?? null;
  }, [activeSession, selectedFilePathBySession]);

  const activeEditorPanel = useMemo(
    () => activePanels.find((panel) => panel.id === activeFocusedPanelId && panel.kind === "editor") ?? null,
    [activeFocusedPanelId, activePanels]
  );

  const activeEditorBuffer = useMemo(() => {
    if (!activeSession || !activeEditorPanel?.filePath) {
      return null;
    }

    return editorStateBySession[activeSession.id]?.buffers[activeEditorPanel.filePath] ?? null;
  }, [activeEditorPanel, activeSession, editorStateBySession]);

  const activeAgentUrl = useMemo(() => getAgentChatUrl(activeSession), [activeSession]);
  const activeSandboxMode = activeSession?.sandboxRuntime?.mode ?? activeProject?.sandbox.mode ?? "pending";

  const refreshProjects = useCallback(async () => {
    if (!window.bigIDE) {
      return;
    }

    try {
      const latest = await window.bigIDE.projects.list();
      setProjects(latest);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load projects");
    }
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
      setInfoMessage("Workspace ready");
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

  const setSessionEditorState = useCallback((sessionId: string, updater: (current: SessionEditorState) => SessionEditorState) => {
    setEditorStateBySession((previous) => ({
      ...previous,
      [sessionId]: updater(previous[sessionId] ?? createEmptyEditorState())
    }));
  }, []);

  const focusPanel = useCallback((sessionId: string, panelId: string | null) => {
    setFocusedPanelIdBySession((previous) => ({
      ...previous,
      [sessionId]: panelId
    }));
  }, []);

  const appendPanel = useCallback(
    (sessionId: string, kind: SessionPanelKind, filePath: string | null = null) => {
      const panel = createPanelInstance(kind, filePath);
      setPanelInstancesBySession((previous) => ({
        ...previous,
        [sessionId]: [...(previous[sessionId] ?? []), panel]
      }));
      focusPanel(sessionId, panel.id);
      return panel;
    },
    [focusPanel]
  );

  const removePanel = useCallback(
    (sessionId: string, panelId: string) => {
      const currentPanels = panelInstancesBySession[sessionId] ?? [];
      const currentIndex = currentPanels.findIndex((panel) => panel.id === panelId);
      if (currentIndex === -1) {
        return;
      }

      const nextPanels = currentPanels.filter((panel) => panel.id !== panelId);
      setPanelInstancesBySession((previous) => ({
        ...previous,
        [sessionId]: nextPanels
      }));

      setFocusedPanelIdBySession((previous) => {
        if (previous[sessionId] !== panelId) {
          return previous;
        }

        const nextFocus = nextPanels[currentIndex] ?? nextPanels[currentIndex - 1] ?? null;
        return {
          ...previous,
          [sessionId]: nextFocus?.id ?? null
        };
      });
    },
    [panelInstancesBySession]
  );

  const saveEditorFile = useCallback(
    async (filePath: string) => {
      if (!window.bigIDE || !activeSession) {
        return;
      }

      const buffer = editorStateBySession[activeSession.id]?.buffers[filePath];
      if (!buffer) {
        return;
      }

      try {
        setBusyAction(true);
        await window.bigIDE.fs.writeFile({
          filePath,
          content: buffer.value
        });
        setSessionEditorState(activeSession.id, (current) => ({
          ...current,
          buffers: {
            ...current.buffers,
            [filePath]: {
              value: buffer.value,
              dirty: false
            }
          }
        }));
        setInfoMessage(`Saved ${toRelativePathLabel(activeSession.workdir, filePath)}`);
        await reloadTree();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to save file");
      } finally {
        setBusyAction(false);
      }
    },
    [activeSession, editorStateBySession, reloadTree, setSessionEditorState]
  );

  const openProjectDialog = useCallback(() => {
    setNewProjectName("");
    setIsProjectDialogOpen(true);
  }, []);

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
        setActiveProjectId(created.id);
        setActiveSessionId(created.sessions[0]?.id ?? null);
        setIsProjectDialogOpen(false);
        setNewProjectName("");
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

  const openSessionDialog = useCallback((projectId: string | null) => {
    if (!projectId) {
      return;
    }

    setSessionCreationProjectId(projectId);
    setNewSessionName("");
    setIsSessionDialogOpen(true);
  }, []);

  const createSession = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!window.bigIDE || !sessionCreationProjectId) {
        return;
      }

      try {
        setBusyAction(true);
        const created = await window.bigIDE.sessions.create({
          projectId: sessionCreationProjectId,
          name: newSessionName.trim() || undefined
        });
        await refreshProjects();
        setActiveProjectId(sessionCreationProjectId);
        setActiveSessionId(created.id);
        setIsSessionDialogOpen(false);
        setNewSessionName("");
        setInfoMessage(`Session created: ${created.name}`);
        setErrorMessage("");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to create session");
      } finally {
        setBusyAction(false);
      }
    },
    [newSessionName, refreshProjects, sessionCreationProjectId]
  );

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
      setErrorMessage("");
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

  const addPanelToActiveSession = useCallback(
    (kind: SessionPanelKind) => {
      if (!activeSession) {
        return;
      }

      appendPanel(activeSession.id, kind);
      setIsPanelDialogOpen(false);
    },
    [activeSession, appendPanel]
  );

  const openFile = useCallback(
    async (filePath: string) => {
      if (!window.bigIDE || !activeSession) {
        return;
      }

      const existingPanel = (panelInstancesBySession[activeSession.id] ?? []).find(
        (panel) => panel.kind === "editor" && panel.filePath === filePath
      );

      setSelectedFilePathBySession((previous) => ({
        ...previous,
        [activeSession.id]: filePath
      }));

      if (existingPanel) {
        focusPanel(activeSession.id, existingPanel.id);
        setErrorMessage("");
        return;
      }

      const existingBuffer = editorStateBySession[activeSession.id]?.buffers[filePath];
      if (existingBuffer) {
        appendPanel(activeSession.id, "editor", filePath);
        setErrorMessage("");
        return;
      }

      try {
        const content = await window.bigIDE.fs.readFile({ filePath });
        setSessionEditorState(activeSession.id, (current) => ({
          ...current,
          buffers: {
            ...current.buffers,
            [filePath]: { value: content, dirty: false }
          }
        }));
        appendPanel(activeSession.id, "editor", filePath);
        setErrorMessage("");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to open file");
      }
    },
    [activeSession, appendPanel, editorStateBySession, focusPanel, panelInstancesBySession, setSessionEditorState]
  );

  const moveSessionPanel = useCallback(
    (sessionId: string, sourcePanelId: string, targetPanelId: string) => {
      setPanelInstancesBySession((previous) => {
        const currentPanels = previous[sessionId] ?? [];
        const sourceIndex = currentPanels.findIndex((panel) => panel.id === sourcePanelId);
        const targetIndex = currentPanels.findIndex((panel) => panel.id === targetPanelId);
        if (sourceIndex === -1 || targetIndex === -1) {
          return previous;
        }

        return {
          ...previous,
          [sessionId]: movePanel(currentPanels, sourceIndex, targetIndex)
        };
      });
    },
    []
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
    setExpandedProjects((previous) => {
      const nextEntries = projects.map((project) => [project.id, previous[project.id] ?? project.id === activeProjectId]);
      const next = Object.fromEntries(nextEntries) as Record<string, boolean>;
      const previousKeys = Object.keys(previous);
      const nextKeys = Object.keys(next);
      const changed =
        previousKeys.length !== nextKeys.length ||
        nextKeys.some((key) => previous[key] !== next[key]);

      return changed ? next : previous;
    });
  }, [activeProjectId, projects]);

  useEffect(() => {
    if (!activeProjectId) {
      return;
    }

    setExpandedProjects((previous) => {
      if (previous[activeProjectId]) {
        return previous;
      }

      return {
        ...previous,
        [activeProjectId]: true
      };
    });
  }, [activeProjectId]);

  useEffect(() => {
    if (!activeSessionId) {
      return;
    }

    setPanelInstancesBySession((previous) => {
      if (previous[activeSessionId]) {
        return previous;
      }

      return {
        ...previous,
        [activeSessionId]: createDefaultPanels()
      };
    });

    setFocusedPanelIdBySession((previous) => {
      if (previous[activeSessionId]) {
        return previous;
      }

      const defaultPanels = panelInstancesBySession[activeSessionId] ?? createDefaultPanels();
      return {
        ...previous,
        [activeSessionId]: defaultPanels[0]?.id ?? null
      };
    });
  }, [activeSessionId, panelInstancesBySession]);

  useEffect(() => {
    if (!activeSession || !activeFocusedPanelId) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      panelRefs.current[activeFocusedPanelId]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center"
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeFocusedPanelId, activeSession]);

  useEffect(() => {
    setIsCommitDialogOpen(false);
    setCommitMessage("");
    setIsPanelDialogOpen(false);
    setWebDraftUrl(DEFAULT_BROWSER_URL);
    setWebUrl("about:blank");
    setWebState("idle");
    void reloadTree();
    void refreshGitStatus();
  }, [activeSession?.id, refreshGitStatus, reloadTree]);

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
    const syncProjects = () => {
      void refreshProjects();
    };

    window.addEventListener(PROJECTS_CHANGED_EVENT, syncProjects);
    return () => window.removeEventListener(PROJECTS_CHANGED_EVENT, syncProjects);
  }, [refreshProjects]);

  useEffect(() => {
    if (!window.bigIDE) {
      return;
    }

    const stopStatus = window.bigIDE.agent.onStatus((payload) => {
      if (payload.sessionId === activeSessionId) {
        setInfoMessage(`Agent ${payload.status}${payload.message ? `: ${payload.message}` : ""}`);
      }
      void refreshProjects();
    });

    return () => {
      stopStatus();
    };
  }, [activeSessionId, refreshProjects]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if ((event.metaKey || event.ctrlKey) && key === "s") {
        if (!activeEditorPanel?.filePath) {
          return;
        }

        event.preventDefault();
        void saveEditorFile(activeEditorPanel.filePath);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && key === "n") {
        if (!activeProjectId) {
          return;
        }

        event.preventDefault();
        openSessionDialog(activeProjectId);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && key === "tab") {
        event.preventDefault();
        cycleSession();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeEditorPanel, activeProjectId, cycleSession, openSessionDialog, saveEditorFile]);

  const renderDragHandle = useCallback(
    (label: string) => (
      <span className="inline-flex size-7 items-center justify-center text-muted-foreground" aria-hidden="true" title={`Drag ${label} panel`}>
        <GripHorizontal className="size-4" />
      </span>
    ),
    []
  );

  const renderClosePanelButton = useCallback(
    (panel: SessionPanelInstance, label: string) => {
      if (!activeSession) {
        return null;
      }

      return (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 rounded-none"
          onClick={() => removePanel(activeSession.id, panel.id)}
          aria-label={`Close ${label} panel`}
        >
          <X className="size-4" />
        </Button>
      );
    },
    [activeSession, removePanel]
  );

  const renderPanel = useCallback(
    (panel: SessionPanelInstance) => {
      if (!activeSession) {
        return null;
      }

      const panelLabel = PANEL_LABELS[panel.kind];

      switch (panel.kind) {
        case "agent":
          return (
            <PanelShell
              title="Agent"
              subtitle={activeAgentUrl ?? "OpenCode chat surface"}
              className="h-full min-h-0"
              actions={
                <>
                  {renderDragHandle(panelLabel)}
                  {renderClosePanelButton(panel, panelLabel)}
                </>
              }
            >
              <AgentPanel session={activeSession} chatUrl={activeAgentUrl} />
            </PanelShell>
          );
        case "files":
          return (
            <PanelShell
              title="Files"
              subtitle={toRelativePathLabel(activeSession.workdir, activeSession.workdir)}
              className="h-full min-h-0"
              actions={
                <>
                  {renderDragHandle(panelLabel)}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 rounded-none"
                    onClick={() => void reloadTree()}
                    aria-label="Refresh file tree"
                  >
                    <RefreshCcw className="size-4" />
                  </Button>
                  {renderClosePanelButton(panel, panelLabel)}
                </>
              }
            >
              <FileTree
                nodes={treeNodes}
                selectedFilePath={activeSelectedFilePath}
                onOpenFile={(filePath) => void openFile(filePath)}
                isLoading={treeLoading}
              />
            </PanelShell>
          );
        case "editor": {
          const editorFilePath = panel.filePath;
          const editorBuffer = editorFilePath ? editorStateBySession[activeSession.id]?.buffers[editorFilePath] ?? null : null;
          const isFocusedEditor = panel.id === activeFocusedPanelId;
          return (
            <PanelShell
              title={editorFilePath ? fileLabel(editorFilePath) : "Editor"}
              subtitle={editorFilePath ? toRelativePathLabel(activeSession.workdir, editorFilePath) : "Open files from the Files panel."}
              className="h-full min-h-0"
              actions={
                <>
                  {renderDragHandle(panelLabel)}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 rounded-none"
                    onClick={() => editorFilePath && void saveEditorFile(editorFilePath)}
                    disabled={!editorFilePath || busyAction}
                    aria-label="Save file"
                  >
                    <Save className="size-4" />
                  </Button>
                  {renderClosePanelButton(panel, panelLabel)}
                </>
              }
            >
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
                  <span {...(isFocusedEditor ? { "data-testid": "editor-active-path" } : {})} className="truncate">
                    {editorFilePath ? toRelativePathLabel(activeSession.workdir, editorFilePath) : "Open a file from the Files panel."}
                  </span>
                  {editorFilePath ? (
                    <Badge variant={editorBuffer?.dirty ? "warning" : "outline"} className="rounded-none px-2 py-0">
                      {editorBuffer?.dirty ? "unsaved" : "saved"}
                    </Badge>
                  ) : null}
                </div>

                <div className="min-h-0 flex-1 overflow-hidden">
                  <EditorPanel
                    filePath={editorFilePath}
                    value={editorBuffer?.value ?? ""}
                    onChange={(value) => {
                      if (!editorFilePath) {
                        return;
                      }

                      setSessionEditorState(activeSession.id, (current) => ({
                        ...current,
                        buffers: {
                          ...current.buffers,
                          [editorFilePath]: {
                            value,
                            dirty: true
                          }
                        }
                      }));
                    }}
                  />
                </div>
              </div>
            </PanelShell>
          );
        }
        case "terminal":
          return (
            <PanelShell
              title="Terminal"
              subtitle={activeSession.name}
              className="h-full min-h-0"
              actions={
                <>
                  {renderDragHandle(panelLabel)}
                  {renderClosePanelButton(panel, panelLabel)}
                </>
              }
            >
              <div className="h-full min-h-0 bg-[#f8f4ea]">
                <TerminalPanel session={activeSession} />
              </div>
            </PanelShell>
          );
        case "git":
          return (
            <PanelShell
              title="Git"
              subtitle="Track branch state and working tree changes."
              className="h-full min-h-0"
              actions={
                <>
                  {renderDragHandle(panelLabel)}
                  <Button
                    data-testid="refresh-git-button"
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 rounded-none"
                    onClick={() => void refreshGitStatus()}
                    aria-label="Refresh git status"
                  >
                    <RefreshCcw className="size-4" />
                  </Button>
                  {renderClosePanelButton(panel, panelLabel)}
                </>
              }
            >
              <div className="flex h-full min-h-0 flex-col">
                {!gitStatus ? (
                  <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-6 text-sm text-muted-foreground">
                    Loading git status...
                  </div>
                ) : !gitStatus.isRepo ? (
                  <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-6 text-sm text-muted-foreground">
                    Workspace is not a git repository.
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-3">
                      <Badge variant="outline" className="rounded-none px-2 py-0">
                        <GitBranch className="mr-1 size-3.5" />
                        {gitStatus.branch ?? "detached"}
                      </Badge>
                      <Badge variant="secondary" className="rounded-none px-2 py-0">
                        +{gitStatus.ahead} / -{gitStatus.behind}
                      </Badge>
                      {selectedGitEntry ? (
                        <Badge
                          variant={selectedGitEntry.staged ? "success" : selectedGitEntry.untracked ? "warning" : "outline"}
                          className="rounded-none px-2 py-0"
                        >
                          {selectedGitEntry.displayStatus}
                        </Badge>
                      ) : null}
                    </div>

                    <div className="min-h-0 flex-1 overflow-auto">
                      {gitStatus.files.length ? (
                        gitStatus.files.map((entry, index) => (
                          <button
                            data-testid="git-file-row"
                            data-git-path={entry.path}
                            type="button"
                            key={`${entry.path}-${index}`}
                            onClick={() => setSelectedGitPath(entry.path)}
                            className={cn(
                              "flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40",
                              selectedGitPath === entry.path && "bg-muted/50",
                              gitEntryClass(entry)
                            )}
                          >
                            <Badge variant={entry.staged ? "success" : entry.untracked ? "warning" : "outline"} className="shrink-0 rounded-none px-2 py-0">
                              {entry.displayStatus}
                            </Badge>
                            <span className="truncate">{entry.path}</span>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-4 text-sm text-muted-foreground">Working tree clean.</div>
                      )}
                    </div>

                    <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                      Latest commit: {gitStatus.latestCommit ?? "no commits yet"}
                    </div>
                    <div className="grid gap-px border-t border-border bg-border sm:grid-cols-3">
                      <Button
                        data-testid="git-stage-button"
                        type="button"
                        variant="secondary"
                        className="rounded-none bg-secondary"
                        onClick={() => void stageGitSelection()}
                        disabled={gitBusyAction !== null || !gitStatus.files.length}
                      >
                        Stage
                      </Button>
                      <Button
                        data-testid="git-discard-button"
                        type="button"
                        variant="outline"
                        className="rounded-none border-0 bg-background"
                        onClick={() => void discardGitSelection()}
                        disabled={gitBusyAction !== null || !selectedGitEntry}
                      >
                        Discard
                      </Button>
                      <Button
                        data-testid="git-commit-button"
                        type="button"
                        className="rounded-none"
                        onClick={openCommitDialog}
                        disabled={gitBusyAction !== null || !gitStatus.isRepo || !hasStagedChanges}
                      >
                        <GitCommitHorizontal className="mr-2 size-4" />
                        Commit
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </PanelShell>
          );
        case "browser":
          return (
            <PanelShell
              title="Browser"
              subtitle="Open a local or remote target in-session."
              className="h-full min-h-0"
              actions={
                <>
                  {renderDragHandle(panelLabel)}
                  {renderClosePanelButton(panel, panelLabel)}
                </>
              }
            >
              <div className="flex h-full min-h-0 flex-col">
                <form className="flex gap-px border-b border-border p-2" onSubmit={openWebView}>
                  <Input
                    data-testid="web-url-input"
                    value={webDraftUrl}
                    onChange={(event) => setWebDraftUrl(event.target.value)}
                    placeholder={DEFAULT_BROWSER_URL}
                    className="rounded-none"
                  />
                  <Button data-testid="web-open-button" type="submit" className="rounded-none">
                    <Globe className="mr-2 size-4" />
                    Open
                  </Button>
                </form>

                <div className="flex flex-wrap gap-px border-b border-border p-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-none"
                    onClick={() => {
                      setWebDraftUrl(DEFAULT_BROWSER_URL);
                      setWebUrl(DEFAULT_BROWSER_URL);
                      setWebState("loading");
                    }}
                  >
                    localhost:3000
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-none"
                    onClick={() => {
                      const healthUrl = "http://127.0.0.1:43111/api/health";
                      setWebDraftUrl(healthUrl);
                      setWebUrl(healthUrl);
                      setWebState("loading");
                    }}
                  >
                    health
                  </Button>
                </div>

                <div data-testid="web-status" className="border-b border-border px-3 py-2 text-sm text-muted-foreground">
                  status: {webState}
                </div>

                {webUrl === "about:blank" ? (
                  <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-sm text-muted-foreground">
                    Enter a URL to load a preview.
                  </div>
                ) : (
                  <div className="min-h-0 flex-1 overflow-hidden bg-white">
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
            </PanelShell>
          );
      }
    },
    [
      activeAgentUrl,
      activeFocusedPanelId,
      activeSelectedFilePath,
      activeSession,
      busyAction,
      discardGitSelection,
      editorStateBySession,
      gitBusyAction,
      gitStatus,
      hasStagedChanges,
      openCommitDialog,
      openFile,
      refreshGitStatus,
      reloadTree,
      renderClosePanelButton,
      renderDragHandle,
      saveEditorFile,
      selectedGitEntry,
      selectedGitPath,
      setSessionEditorState,
      stageGitSelection,
      treeLoading,
      treeNodes,
      webDraftUrl,
      webState,
      webUrl
    ]
  );

  if (!window.bigIDE) {
    return (
      <main className="flex h-full items-center justify-center bg-background p-6">
        <div className="w-full max-w-lg border border-border bg-background">
          <div className="border-b border-border px-4 py-3">
            <h1 className="text-base font-semibold">Backend unavailable</h1>
            <p className="mt-1 text-sm text-muted-foreground">Use `npm run dev` or `npm run dev:web` to connect the workspace runtime.</p>
          </div>
        </div>
      </main>
    );
  }

  const sessionCreationProject = projects.find((project) => project.id === sessionCreationProjectId) ?? null;

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground md:flex-row">
      <aside className="flex min-h-0 w-full flex-col border-b border-border bg-card md:w-[20rem] md:min-w-[20rem] md:border-b-0 md:border-r">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h1 data-testid="workspace-app-title" className="truncate text-lg font-semibold tracking-tight">
              The Big IDE
            </h1>
            <Button
              data-testid="new-project-button"
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0 rounded-none px-2.5"
              onClick={openProjectDialog}
            >
              [+ New Project]
            </Button>
          </div>
          {errorMessage ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {errorMessage}
            </p>
          ) : null}
        </div>

        <nav aria-label="Projects and sessions" className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {!projects.length ? <p className="px-1 text-sm text-muted-foreground">No projects yet.</p> : null}

          <ul className="space-y-1.5">
            {projects.map((project) => {
              const isActiveProject = project.id === activeProjectId;
              const isExpanded = expandedProjects[project.id] ?? isActiveProject;

              return (
                <li key={project.id} className="border-b border-border/80 pb-1 last:border-b-0">
                  <div className={cn("flex items-center gap-1 px-1 py-1", isActiveProject && "bg-muted/40")}>
                    <button
                      type="button"
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-none text-muted-foreground transition-colors hover:text-foreground"
                      aria-label={`${isExpanded ? "Collapse" : "Expand"} ${project.name}`}
                      aria-expanded={isExpanded}
                      onClick={() => {
                        setExpandedProjects((previous) => ({
                          ...previous,
                          [project.id]: !isExpanded
                        }));
                      }}
                    >
                      {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </button>
                    <button
                      type="button"
                      aria-current={isActiveProject ? "page" : undefined}
                      className={cn(
                        "min-w-0 flex-1 truncate text-left text-sm font-medium transition-colors hover:text-primary",
                        isActiveProject && "text-primary"
                      )}
                      onClick={() => {
                        setExpandedProjects((previous) => ({
                          ...previous,
                          [project.id]: true
                        }));
                        setActiveProjectId(project.id);
                        setActiveSessionId(project.id === activeProjectId ? activeSessionId : project.sessions[0]?.id ?? null);
                      }}
                    >
                      {project.name}
                    </button>
                    <Badge variant="outline" className="rounded-none px-1.5 py-0 text-[10px] uppercase tracking-[0.12em]">
                      {project.sessions.length}
                    </Badge>
                    <Button
                      data-testid="new-session-button"
                      data-project-name={project.name}
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 rounded-none px-2 text-[11px]"
                      onClick={() => openSessionDialog(project.id)}
                    >
                      + Session
                    </Button>
                  </div>

                  {isExpanded ? (
                    project.sessions.length ? (
                      <div className="ml-4 border-l border-border/80 pl-2">
                        {project.sessions.map((session) => {
                          const isActiveSession = session.id === activeSessionId;

                          return (
                            <button
                              data-testid="session-row"
                              data-session-name={session.name}
                              data-session-status={session.status}
                              type="button"
                              key={session.id}
                              className={cn(
                                "mt-1 flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-muted/50",
                                isActiveSession && "bg-muted/50"
                              )}
                              onClick={() => {
                                setExpandedProjects((previous) => ({
                                  ...previous,
                                  [project.id]: true
                                }));
                                setActiveProjectId(project.id);
                                setActiveSessionId(session.id);
                              }}
                            >
                              <span className={cn("size-1.5 shrink-0 rounded-full", session.status === "running" ? "bg-emerald-500" : "bg-muted-foreground")} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">{session.name}</span>
                                <span className="block truncate text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                                  {session.status} - {formatAgentStatus(session.agentStatus)}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="ml-4 border-l border-border/80 px-2 py-2 text-xs text-muted-foreground">No sessions yet.</div>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
        </nav>

        <div className={cn("border-t border-border px-4 py-3 text-xs", errorMessage ? "text-destructive" : "text-muted-foreground")}>
          {errorMessage || infoMessage || boot?.workspaceRoot || "Workspace ready"}
        </div>
      </aside>

      <section className="min-h-0 flex-1 overflow-hidden">
        <div data-testid="session-panel-area" className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
          {!activeSession ? (
            <>
              <div className="border-b border-border px-4 py-4">
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Session workspace</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {activeProject
                    ? "Select a session or create one from the project card to open its panels."
                    : "Create a project first, then add a session from its project card."}
                </p>
              </div>
              <div
                data-testid="session-panel-empty-state"
                className="flex min-h-0 flex-1 items-center justify-center px-6 py-10 text-center"
              >
                <div className="max-w-md space-y-3">
                  <p className="text-lg font-semibold tracking-tight text-foreground">No session selected</p>
                  <p className="text-sm text-muted-foreground">
                    {activeProject
                      ? "Use the + Session button inside the active project card or choose an existing session to open its panel rail."
                      : "Start by creating a project, then add a session to view its workspace panels."}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="border-b border-border px-4 py-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 space-y-3">
                    <div>
                      <span data-testid="active-session-label" className="block text-lg font-semibold tracking-tight">
                        Session: {activeSession.name}
                      </span>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="rounded-none px-2 py-0 text-[10px] uppercase tracking-[0.12em]">
                          {activeProject?.name}
                        </Badge>
                        <Badge variant={sessionStatusVariant(activeSession)} className="rounded-none px-2 py-0 text-[10px] uppercase tracking-[0.12em]">
                          {activeSession.status}
                        </Badge>
                        <Badge variant={agentStatusVariant(activeSession.agentStatus)} className="rounded-none px-2 py-0 text-[10px] uppercase tracking-[0.12em]">
                          OpenCode {formatAgentStatus(activeSession.agentStatus)}
                        </Badge>
                        <Badge variant="outline" className="rounded-none px-2 py-0 text-[10px] uppercase tracking-[0.12em]" data-testid="session-sandbox-mode">
                          sandbox {activeSandboxMode}
                        </Badge>
                        <Badge variant={boot?.docker.available ? "success" : "warning"} className="rounded-none px-2 py-0 text-[10px] uppercase tracking-[0.12em]">
                          {boot?.docker.available ? "docker ready" : "docker unavailable"}
                        </Badge>
                      </div>
                    </div>

                    <div data-testid="session-runtime-context" className="grid gap-1 text-xs text-muted-foreground">
                      <span>workspace {toRelativePathLabel(activeSession.workdir, activeSession.workdir)}</span>
                      <span>
                        {boot?.runtimeTarget ?? "unknown"} runtime - {activeSession.agentRuntime?.message || "OpenCode not started"}
                      </span>
                      {activeAgentUrl ? (
                        <span data-testid="session-agent-url" className="truncate">
                          {activeAgentUrl}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      data-testid="start-session-button"
                      type="button"
                      size="sm"
                      className="rounded-none px-3"
                      onClick={() => void startSession()}
                      disabled={busyAction}
                    >
                      <Play className="mr-1.5 size-3.5" />
                      Start
                    </Button>
                    <Button
                      data-testid="stop-session-button"
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="rounded-none px-3"
                      onClick={() => void stopSession()}
                      disabled={busyAction}
                    >
                      <Square className="mr-1.5 size-3.5" />
                      Stop
                    </Button>
                    <Button
                      data-testid="new-panel-button"
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-none px-3"
                      onClick={() => setIsPanelDialogOpen(true)}
                    >
                      [+ New Panel]
                    </Button>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden px-3 py-3">
                {activePanels.length ? (
                  <div data-testid="session-panel-scroll-region" className="h-full min-h-0 overflow-auto overscroll-contain">
                    <div
                      data-testid="session-panel-rail"
                      className="flex min-h-full w-max min-w-full flex-nowrap items-stretch gap-3 pb-2 pr-3"
                    >
                      {activePanels.map((panel) => (
                      <div
                        data-testid="session-panel"
                        data-panel-id={panel.kind}
                        data-file-path={panel.filePath ?? undefined}
                        key={panel.id}
                        ref={(node) => {
                          panelRefs.current[panel.id] = node;
                        }}
                        draggable
                        onClick={() => focusPanel(activeSession.id, panel.id)}
                        onDragStart={() => {
                          setDraggedPanelId(panel.id);
                          focusPanel(activeSession.id, panel.id);
                        }}
                        onDragOver={(event) => {
                          if (!draggedPanelId || draggedPanelId === panel.id) {
                            return;
                          }

                          event.preventDefault();
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (!draggedPanelId || draggedPanelId === panel.id) {
                            return;
                          }

                          moveSessionPanel(activeSession.id, draggedPanelId, panel.id);
                          setDraggedPanelId(null);
                        }}
                        onDragEnd={() => setDraggedPanelId(null)}
                        className={cn(
                          "h-full min-h-0 w-[22rem] shrink-0 sm:w-[24rem] lg:w-[28rem] xl:w-[30rem]",
                          panel.id === activeFocusedPanelId && "ring-2 ring-primary/25 ring-offset-2 ring-offset-background",
                          draggedPanelId === panel.id && "opacity-70"
                        )}
                      >
                        {renderPanel(panel)}
                      </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full min-h-0 items-center justify-center border border-dashed border-border px-6 text-center">
                    <div className="max-w-sm space-y-3">
                      <p className="text-base font-semibold">No panels open</p>
                      <p className="text-sm text-muted-foreground">Use `[+ New Panel]` to add Agent, Files, Terminal, Git, or Browser panels. Editor panels open from Files.</p>
                      <Button type="button" size="sm" variant="outline" className="rounded-none" onClick={() => setIsPanelDialogOpen(true)}>
                        [+ New Panel]
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      <Dialog open={isProjectDialogOpen} onOpenChange={setIsProjectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
            <DialogDescription>Add a project to the workspace. New sessions can then be created from the project card.</DialogDescription>
          </DialogHeader>

          <form className="grid gap-4" onSubmit={createProject}>
            <Input
              data-testid="project-name-input"
              value={newProjectName}
              onChange={(event) => setNewProjectName(event.target.value)}
              placeholder="New project"
              className="rounded-none"
              autoFocus
            />
            <DialogFooter>
              <Button type="button" variant="outline" className="rounded-none" onClick={() => setIsProjectDialogOpen(false)}>
                Cancel
              </Button>
              <Button data-testid="create-project-button" type="submit" className="rounded-none" disabled={busyAction || !newProjectName.trim()}>
                Create project
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isSessionDialogOpen} onOpenChange={setIsSessionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create session</DialogTitle>
            <DialogDescription>
              {sessionCreationProject ? `Create a new session inside ${sessionCreationProject.name}.` : "Choose a project first."}
            </DialogDescription>
          </DialogHeader>

          <form className="grid gap-4" onSubmit={createSession}>
            <Input
              data-testid="session-name-input"
              value={newSessionName}
              onChange={(event) => setNewSessionName(event.target.value)}
              placeholder="backend-debug"
              className="rounded-none"
              autoFocus
            />
            <DialogFooter>
              <Button type="button" variant="outline" className="rounded-none" onClick={() => setIsSessionDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                data-testid="create-session-button"
                type="submit"
                variant="secondary"
                className="rounded-none"
                disabled={busyAction || !sessionCreationProjectId}
              >
                Create session
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isPanelDialogOpen} onOpenChange={setIsPanelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add panel</DialogTitle>
            <DialogDescription>Create another panel in the current session. Editor panels open from Files when you open a file.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            {NEW_PANEL_OPTIONS.map((option) => (
              <button
                key={option.kind}
                data-testid={`new-panel-option-${option.kind}`}
                type="button"
                className="grid gap-1 border border-border px-3 py-3 text-left transition-colors hover:bg-muted/30"
                onClick={() => addPanelToActiveSession(option.kind)}
              >
                <span className="text-sm font-semibold">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

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
            <Input value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} placeholder="chore: update session state" className="rounded-none" />
            <DialogFooter>
              <Button type="button" variant="outline" className="rounded-none" onClick={() => setIsCommitDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="rounded-none" disabled={gitBusyAction === "commit" || !commitMessage.trim()}>
                Create commit
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
