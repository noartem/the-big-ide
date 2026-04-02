import {
  FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  GitBranch,
  GitCommitHorizontal,
  GripHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  RefreshCcw,
  Save,
  Square,
  X,
} from "lucide-react";

import { AgentPanel } from "@/components/agent-panel";
import { EditorPanel } from "@/components/editor-panel";
import { FileTree } from "@/components/file-tree";
import { TerminalPanel } from "@/components/terminal-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PanelShell } from "@/components/ui/panel-shell";
import { cn } from "@/lib/utils";
import type {
  FileNode,
  GitStatusEntry,
  GitStatusSnapshot,
  PanelId,
  Project,
  Session,
} from "@/types/big-ide";

const PROJECTS_CHANGED_EVENT = "bigide:projects-changed";
const DEFAULT_BROWSER_URL = "http://localhost:3000";
const PANEL_MIN_WIDTH = 320;
const PANEL_MAX_WIDTH = 960;

type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "success"
  | "warning"
  | "danger";
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
  browser: "Browser",
};

const NEW_PANEL_OPTIONS: Array<{
  kind: SessionPanelKind;
  label: string;
  description: string;
}> = [
  {
    kind: "agent",
    label: "Agent",
    description: "Add another OpenCode surface.",
  },
  {
    kind: "files",
    label: "Files",
    description: "Browse the workspace tree in a separate panel.",
  },
  {
    kind: "terminal",
    label: "Terminal",
    description: "Open another terminal view for the session.",
  },
  {
    kind: "git",
    label: "Git",
    description: "Inspect git state in an additional panel.",
  },
  {
    kind: "browser",
    label: "Browser",
    description: "Open another preview/browser panel.",
  },
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
    buffers: {},
  };
}

function createPanelInstance(
  kind: SessionPanelKind,
  filePath: string | null = null,
): SessionPanelInstance {
  const id =
    globalThis.crypto?.randomUUID?.() ??
    `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

function projectCompactLabel(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return initials || name.slice(0, 2).toUpperCase();
}

function toRelativePathLabel(
  basePath: string | null | undefined,
  targetPath: string | null | undefined,
  rootLabel = "./",
) {
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
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [panelInstancesBySession, setPanelInstancesBySession] = useState<
    Record<string, SessionPanelInstance[]>
  >({});
  const [focusedPanelIdBySession, setFocusedPanelIdBySession] = useState<
    Record<string, string | null>
  >({});
  const [selectedFilePathBySession, setSelectedFilePathBySession] = useState<
    Record<string, string | null>
  >({});

  const [treeNodes, setTreeNodes] = useState<FileNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [editorStateBySession, setEditorStateBySession] = useState<
    Record<string, SessionEditorState>
  >({});

  const [newProjectName, setNewProjectName] = useState("");
  const [newSessionName, setNewSessionName] = useState("");
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [isSessionDialogOpen, setIsSessionDialogOpen] = useState(false);
  const [sessionCreationProjectId, setSessionCreationProjectId] = useState<
    string | null
  >(null);
  const [isPanelDialogOpen, setIsPanelDialogOpen] = useState(false);
  const [sessionNameDraft, setSessionNameDraft] = useState("");
  const [draggedPanelId, setDraggedPanelId] = useState<string | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<
    Record<string, boolean>
  >({});
  const [isProjectsSidebarCollapsed, setIsProjectsSidebarCollapsed] =
    useState(false);

  const [infoMessage, setInfoMessage] = useState("Initializing workspace...");
  const [errorMessage, setErrorMessage] = useState("");
  const [busyAction, setBusyAction] = useState(false);

  const [gitStatus, setGitStatus] = useState<GitStatusSnapshot | null>(null);
  const [selectedGitPath, setSelectedGitPath] = useState<string | null>(null);
  const [gitBusyAction, setGitBusyAction] = useState<
    "stage" | "discard" | "commit" | null
  >(null);
  const [isCommitDialogOpen, setIsCommitDialogOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");

  const [webDraftUrl, setWebDraftUrl] = useState(DEFAULT_BROWSER_URL);
  const [webUrl, setWebUrl] = useState("about:blank");
  const [webState, setWebState] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const [panelWidthsBySession, setPanelWidthsBySession] = useState<
    Record<string, Record<string, number>>
  >({});
  const [resizingPanelId, setResizingPanelId] = useState<string | null>(null);
  const [panelFocusIntent, setPanelFocusIntent] = useState<{
    nonce: number;
    panelId: string;
    sessionId: string;
  } | null>(null);

  const panelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const panelContentFocusRefs = useRef<Record<string, (() => void) | null>>({});
  const panelOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const panelFocusNonceRef = useRef(0);
  const panelResizeStateRef = useRef<{
    panelId: string;
    sessionId: string;
    startWidth: number;
    startX: number;
  } | null>(null);
  const draggedPanelIdRef = useRef<string | null>(null);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects],
  );

  const activeSession = useMemo(
    () =>
      activeProject?.sessions.find(
        (session) => session.id === activeSessionId,
      ) ?? null,
    [activeProject, activeSessionId],
  );

  const activePanels = useMemo(
    () =>
      activeSession ? (panelInstancesBySession[activeSession.id] ?? []) : [],
    [activeSession, panelInstancesBySession],
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

  const workspaceSessions = useMemo(
    () =>
      projects.flatMap((project) =>
        project.sessions.map((session) => ({
          projectId: project.id,
          projectName: project.name,
          session,
        })),
      ),
    [projects],
  );

  const activeEditorPanel = useMemo(
    () =>
      activePanels.find(
        (panel) => panel.id === activeFocusedPanelId && panel.kind === "editor",
      ) ?? null,
    [activeFocusedPanelId, activePanels],
  );

  const activeEditorBuffer = useMemo(() => {
    if (!activeSession || !activeEditorPanel?.filePath) {
      return null;
    }

    return (
      editorStateBySession[activeSession.id]?.buffers[
        activeEditorPanel.filePath
      ] ?? null
    );
  }, [activeEditorPanel, activeSession, editorStateBySession]);

  const activeAgentUrl = useMemo(
    () => getAgentChatUrl(activeSession),
    [activeSession],
  );
  const activePanelWidths = useMemo(() => {
    if (!activeSession) {
      return {};
    }

    return panelWidthsBySession[activeSession.id] ?? {};
  }, [activeSession, panelWidthsBySession]);
  const normalizedWebDraftUrl = useMemo(
    () => normalizeWebUrl(webDraftUrl),
    [webDraftUrl],
  );
  const showWebOpenButton = normalizedWebDraftUrl !== webUrl;

  const refreshProjects = useCallback(async () => {
    if (!window.bigIDE) {
      return;
    }

    try {
      const latest = await window.bigIDE.projects.list();
      setProjects(latest);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load projects",
      );
    }
  }, []);

  const bootstrapWorkspace = useCallback(async () => {
    if (!window.bigIDE) {
      setErrorMessage(
        "Big IDE API is not available. Start Electron or web backend.",
      );
      return;
    }

    try {
      const payload = await window.bigIDE.bootstrap();
      setProjects(payload.projects);
      setInfoMessage("Workspace ready");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to initialize workspace",
      );
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
        maxDepth: 5,
      });
      setTreeNodes(files);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to read file tree",
      );
    } finally {
      setTreeLoading(false);
    }
  }, [activeSession]);

  const setSessionEditorState = useCallback(
    (
      sessionId: string,
      updater: (current: SessionEditorState) => SessionEditorState,
    ) => {
      setEditorStateBySession((previous) => ({
        ...previous,
        [sessionId]: updater(previous[sessionId] ?? createEmptyEditorState()),
      }));
    },
    [],
  );

  const focusPanel = useCallback(
    (sessionId: string, panelId: string | null) => {
      setFocusedPanelIdBySession((previous) => ({
        ...previous,
        [sessionId]: panelId,
      }));
    },
    [],
  );

  const focusPanelContent = useCallback(
    (sessionId: string, panelId: string) => {
      const tryFocus = (remainingAttempts: number) => {
        const panelNode = panelRefs.current[panelId];
        const panelKind = panelNode?.dataset.panelId as
          | SessionPanelKind
          | undefined;
        if (!panelNode || !panelKind) {
          if (remainingAttempts > 0) {
            window.requestAnimationFrame(() => tryFocus(remainingAttempts - 1));
          }
          return;
        }

        let target: HTMLElement | null = null;
        switch (panelKind) {
          case "browser":
            target = panelNode.querySelector<HTMLElement>(
              '[data-testid="web-url-input"]',
            );
            break;
          case "editor":
            if (panelContentFocusRefs.current[panelId]) {
              panelContentFocusRefs.current[panelId]?.();
              return;
            }

            target = panelNode.querySelector<HTMLElement>(
              '.monaco-editor textarea.inputarea, .monaco-editor textarea, .monaco-editor [contenteditable="true"]',
            );
            break;
          case "files":
            target = panelNode.querySelector<HTMLElement>(
              '[data-file-tree-item="true"]',
            );
            break;
          case "terminal":
            if (panelContentFocusRefs.current[panelId]) {
              panelContentFocusRefs.current[panelId]?.();
              return;
            }

            target = panelNode.querySelector<HTMLElement>(
              ".xterm-helper-textarea, .xterm textarea",
            );
            break;
          default:
            target = panelNode;
            break;
        }

        if (target) {
          target.focus({ preventScroll: true });
          return;
        }

        if (remainingAttempts > 0) {
          window.requestAnimationFrame(() => tryFocus(remainingAttempts - 1));
        }
      };

      window.requestAnimationFrame(() => tryFocus(60));
    },
    [],
  );

  const requestPanelContentFocus = useCallback(
    (sessionId: string, panelId: string) => {
      panelFocusNonceRef.current += 1;
      setPanelFocusIntent({
        nonce: panelFocusNonceRef.current,
        panelId,
        sessionId,
      });
    },
    [],
  );

  const appendPanel = useCallback(
    (
      sessionId: string,
      kind: SessionPanelKind,
      filePath: string | null = null,
    ) => {
      const panel = createPanelInstance(kind, filePath);
      setPanelInstancesBySession((previous) => ({
        ...previous,
        [sessionId]: [...(previous[sessionId] ?? []), panel],
      }));
      focusPanel(sessionId, panel.id);
      return panel;
    },
    [focusPanel],
  );

  const closePanel = useCallback(
    (
      sessionId: string,
      panelId: string,
      options?: { focusFallbackContent?: boolean; selectFallback?: boolean },
    ) => {
      const currentPanels = panelInstancesBySession[sessionId] ?? [];
      const currentIndex = currentPanels.findIndex(
        (panel) => panel.id === panelId,
      );
      if (currentIndex === -1) {
        return;
      }

      const nextPanels = currentPanels.filter((panel) => panel.id !== panelId);
      const nextFocus =
        nextPanels[currentIndex] ?? nextPanels[currentIndex - 1] ?? null;
      setPanelInstancesBySession((previous) => ({
        ...previous,
        [sessionId]: nextPanels,
      }));

      setFocusedPanelIdBySession((previous) => {
        if (!options?.selectFallback && previous[sessionId] !== panelId) {
          return previous;
        }

        return {
          ...previous,
          [sessionId]: nextFocus?.id ?? null,
        };
      });

      setPanelWidthsBySession((previous) => {
        const sessionWidths = previous[sessionId];
        if (!sessionWidths || !(panelId in sessionWidths)) {
          return previous;
        }

        const { [panelId]: _removedWidth, ...nextSessionWidths } =
          sessionWidths;
        return {
          ...previous,
          [sessionId]: nextSessionWidths,
        };
      });

      if (options?.focusFallbackContent && nextFocus) {
        requestPanelContentFocus(sessionId, nextFocus.id);
      }
    },
    [panelInstancesBySession, requestPanelContentFocus],
  );

  const scrollPanelIntoView = useCallback((panelId: string) => {
    const tryScroll = (remainingAttempts: number) => {
      const panelNode = panelRefs.current[panelId];
      if (panelNode) {
        panelNode.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
        return;
      }

      if (remainingAttempts > 0) {
        window.requestAnimationFrame(() => tryScroll(remainingAttempts - 1));
      }
    };

    window.requestAnimationFrame(() => tryScroll(4));
  }, []);

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
          content: buffer.value,
        });
        setSessionEditorState(activeSession.id, (current) => ({
          ...current,
          buffers: {
            ...current.buffers,
            [filePath]: {
              value: buffer.value,
              dirty: false,
            },
          },
        }));
        setInfoMessage(
          `Saved ${toRelativePathLabel(activeSession.workdir, filePath)}`,
        );
        await reloadTree();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to save file",
        );
      } finally {
        setBusyAction(false);
      }
    },
    [activeSession, editorStateBySession, reloadTree, setSessionEditorState],
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
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to create project",
        );
      } finally {
        setBusyAction(false);
      }
    },
    [newProjectName, refreshProjects],
  );

  const openSessionDialog = useCallback((projectId: string | null) => {
    if (!projectId) {
      return;
    }

    setSessionCreationProjectId(projectId);
    setNewSessionName("");
    setIsSessionDialogOpen(true);
  }, []);

  const syncSessionInProjects = useCallback(
    (projectId: string, nextSession: Session) => {
      setProjects((previous) =>
        previous.map((project) =>
          project.id !== projectId
            ? project
            : {
                ...project,
                sessions: project.sessions.map((session) =>
                  session.id === nextSession.id ? nextSession : session,
                ),
              },
        ),
      );
    },
    [],
  );

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
          name: newSessionName.trim() || undefined,
        });
        await refreshProjects();
        setActiveProjectId(sessionCreationProjectId);
        setActiveSessionId(created.id);
        setIsSessionDialogOpen(false);
        setNewSessionName("");
        setInfoMessage(`Session created: ${created.name}`);
        setErrorMessage("");
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to create session",
        );
      } finally {
        setBusyAction(false);
      }
    },
    [newSessionName, refreshProjects, sessionCreationProjectId],
  );

  const renameActiveSession = useCallback(async () => {
    if (!window.bigIDE || !activeProjectId || !activeSession) {
      return;
    }

    const nextName = sessionNameDraft.trim();
    if (!nextName || nextName === activeSession.name) {
      setSessionNameDraft(activeSession.name);
      return;
    }

    try {
      const updatedSession = await window.bigIDE.sessions.rename({
        projectId: activeProjectId,
        sessionId: activeSession.id,
        name: nextName,
      });
      syncSessionInProjects(activeProjectId, updatedSession);
      setSessionNameDraft(updatedSession.name);
      setInfoMessage(`Session renamed: ${updatedSession.name}`);
      setErrorMessage("");
    } catch (error) {
      setSessionNameDraft(activeSession.name);
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to rename session",
      );
    }
  }, [activeProjectId, activeSession, sessionNameDraft, syncSessionInProjects]);

  const startSession = useCallback(async () => {
    if (!window.bigIDE || !activeProjectId || !activeSessionId) {
      return;
    }

    try {
      setBusyAction(true);
      await window.bigIDE.sessions.start({
        projectId: activeProjectId,
        sessionId: activeSessionId,
      });
      await refreshProjects();
      setInfoMessage("Session started");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to start session",
      );
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
        sessionId: activeSessionId,
      });
      await refreshProjects();
      setInfoMessage("Session stopped");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to stop session",
      );
    } finally {
      setBusyAction(false);
    }
  }, [activeProjectId, activeSessionId, refreshProjects]);

  const cycleSession = useCallback(
    (direction: 1 | -1 = 1) => {
      if (!workspaceSessions.length) {
        return;
      }

      const currentIndex = workspaceSessions.findIndex(
        ({ session }) => session.id === activeSessionId,
      );
      const fallbackIndex = direction > 0 ? 0 : workspaceSessions.length - 1;
      const nextIndex =
        currentIndex === -1
          ? fallbackIndex
          : (currentIndex + direction + workspaceSessions.length) %
            workspaceSessions.length;
      const nextSession = workspaceSessions[nextIndex];
      if (!nextSession) {
        return;
      }

      setExpandedProjects((previous) => ({
        ...previous,
        [nextSession.projectId]: true,
      }));
      setActiveProjectId(nextSession.projectId);
      setActiveSessionId(nextSession.session.id);
      setInfoMessage(
        `Switched to ${nextSession.projectName} / ${nextSession.session.name}`,
      );
    },
    [activeSessionId, workspaceSessions],
  );

  const applyGitSnapshot = useCallback((snapshot: GitStatusSnapshot) => {
    setGitStatus(snapshot);
    setSelectedGitPath((currentPath) => {
      if (
        currentPath &&
        snapshot.files.some((entry) => entry.path === currentPath)
      ) {
        return currentPath;
      }

      return snapshot.files[0]?.path ?? null;
    });
  }, []);

  const selectedGitEntry = useMemo(() => {
    if (!gitStatus || !selectedGitPath) {
      return null;
    }

    return (
      gitStatus.files.find((entry) => entry.path === selectedGitPath) ?? null
    );
  }, [gitStatus, selectedGitPath]);

  const hasStagedChanges = useMemo(
    () => Boolean(gitStatus?.files.some((entry) => entry.staged)),
    [gitStatus],
  );

  const refreshGitStatus = useCallback(async () => {
    if (!window.bigIDE || !activeSession) {
      setGitStatus(null);
      setSelectedGitPath(null);
      return;
    }

    try {
      const snapshot = await window.bigIDE.git.status({
        cwd: activeSession.workdir,
      });
      applyGitSnapshot(snapshot);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load git status",
      );
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
        filePath: selectedGitEntry?.path ?? null,
      });
      applyGitSnapshot(snapshot);
      setInfoMessage(
        selectedGitEntry
          ? `Staged ${selectedGitEntry.path}`
          : "Staged all changes",
      );
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to stage git changes",
      );
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
        untracked: selectedGitEntry.untracked,
      });
      applyGitSnapshot(snapshot);
      setInfoMessage(`Discarded ${selectedGitEntry.path}`);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to discard git changes",
      );
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
        message,
      });
      applyGitSnapshot(result.status);
      const outputLine = result.output.split(/\r?\n/).find(Boolean);
      setInfoMessage(outputLine || "Commit created");
      setErrorMessage("");
      setIsCommitDialogOpen(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to create commit",
      );
    } finally {
      setGitBusyAction(null);
    }
  }, [activeSession, applyGitSnapshot, commitMessage]);

  const openCommitDialog = useCallback(() => {
    if (!activeSession) {
      return;
    }

    setCommitMessage(
      (currentMessage) =>
        currentMessage || `chore: update ${activeSession.name}`,
    );
    setIsCommitDialogOpen(true);
  }, [activeSession]);

  const openWebView = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setWebDraftUrl(normalizedWebDraftUrl);
      setWebUrl(normalizedWebDraftUrl);
      setWebState(normalizedWebDraftUrl === "about:blank" ? "idle" : "loading");
    },
    [normalizedWebDraftUrl],
  );

  const openPanelDialog = useCallback(() => {
    if (!activeSession) {
      return;
    }

    setIsPanelDialogOpen(true);
  }, [activeSession]);

  const addPanelToActiveSession = useCallback(
    (kind: SessionPanelKind) => {
      if (!activeSession) {
        return;
      }

      appendPanel(activeSession.id, kind);
      setIsPanelDialogOpen(false);
    },
    [activeSession, appendPanel],
  );

  const focusPanelOption = useCallback((index: number) => {
    if (!NEW_PANEL_OPTIONS.length) {
      return;
    }

    const normalizedIndex =
      ((index % NEW_PANEL_OPTIONS.length) + NEW_PANEL_OPTIONS.length) %
      NEW_PANEL_OPTIONS.length;
    panelOptionRefs.current[normalizedIndex]?.focus();
  }, []);

  const handlePanelOptionKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
      switch (event.key) {
        case "ArrowDown":
        case "ArrowRight":
          event.preventDefault();
          focusPanelOption(index + 1);
          return;
        case "ArrowUp":
        case "ArrowLeft":
          event.preventDefault();
          focusPanelOption(index - 1);
          return;
        case "Home":
          event.preventDefault();
          focusPanelOption(0);
          return;
        case "End":
          event.preventDefault();
          focusPanelOption(NEW_PANEL_OPTIONS.length - 1);
          return;
      }
    },
    [focusPanelOption],
  );

  const getFocusedWorkspacePanelId = useCallback(
    (sessionId: string, options?: { requireDomFocus?: boolean }) => {
      const panels = panelInstancesBySession[sessionId] ?? [];
      const activeElement = document.activeElement;
      const focusedPanelId =
        activeElement instanceof HTMLElement
          ? (activeElement.closest<HTMLElement>("[data-panel-instance-id]")
              ?.dataset.panelInstanceId ?? null)
          : null;

      if (
        focusedPanelId &&
        panels.some((panel) => panel.id === focusedPanelId)
      ) {
        return focusedPanelId;
      }

      if (options?.requireDomFocus) {
        return null;
      }

      const selectedPanelId = focusedPanelIdBySession[sessionId] ?? null;
      if (
        selectedPanelId &&
        panels.some((panel) => panel.id === selectedPanelId)
      ) {
        return selectedPanelId;
      }

      return panels[0]?.id ?? null;
    },
    [focusedPanelIdBySession, panelInstancesBySession],
  );

  const openFile = useCallback(
    async (filePath: string, options?: { focusEditor?: boolean }) => {
      if (!window.bigIDE || !activeSession) {
        return;
      }

      const existingPanel = (
        panelInstancesBySession[activeSession.id] ?? []
      ).find((panel) => panel.kind === "editor" && panel.filePath === filePath);

      setSelectedFilePathBySession((previous) => ({
        ...previous,
        [activeSession.id]: filePath,
      }));

      if (existingPanel) {
        focusPanel(activeSession.id, existingPanel.id);
        scrollPanelIntoView(existingPanel.id);
        if (options?.focusEditor) {
          requestPanelContentFocus(activeSession.id, existingPanel.id);
        }
        setErrorMessage("");
        return;
      }

      const existingBuffer =
        editorStateBySession[activeSession.id]?.buffers[filePath];
      if (existingBuffer) {
        const panel = appendPanel(activeSession.id, "editor", filePath);
        scrollPanelIntoView(panel.id);
        if (options?.focusEditor) {
          requestPanelContentFocus(activeSession.id, panel.id);
        }
        setErrorMessage("");
        return;
      }

      try {
        const content = await window.bigIDE.fs.readFile({ filePath });
        setSessionEditorState(activeSession.id, (current) => ({
          ...current,
          buffers: {
            ...current.buffers,
            [filePath]: { value: content, dirty: false },
          },
        }));
        const panel = appendPanel(activeSession.id, "editor", filePath);
        scrollPanelIntoView(panel.id);
        if (options?.focusEditor) {
          requestPanelContentFocus(activeSession.id, panel.id);
        }
        setErrorMessage("");
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to open file",
        );
      }
    },
    [
      activeSession,
      appendPanel,
      editorStateBySession,
      focusPanel,
      panelInstancesBySession,
      requestPanelContentFocus,
      scrollPanelIntoView,
      setSessionEditorState,
    ],
  );

  const moveSessionPanel = useCallback(
    (sessionId: string, sourcePanelId: string, targetPanelId: string) => {
      setPanelInstancesBySession((previous) => {
        const currentPanels = previous[sessionId] ?? [];
        const sourceIndex = currentPanels.findIndex(
          (panel) => panel.id === sourcePanelId,
        );
        const targetIndex = currentPanels.findIndex(
          (panel) => panel.id === targetPanelId,
        );
        if (sourceIndex === -1 || targetIndex === -1) {
          return previous;
        }

        return {
          ...previous,
          [sessionId]: movePanel(currentPanels, sourceIndex, targetIndex),
        };
      });
    },
    [],
  );

  const cycleActivePanel = useCallback(
    (direction: 1 | -1) => {
      if (!activeSession) {
        return;
      }

      const panels = panelInstancesBySession[activeSession.id] ?? [];
      if (panels.length <= 1) {
        return;
      }

      const focusedPanelId =
        getFocusedWorkspacePanelId(activeSession.id) ?? activeFocusedPanelId;
      const currentIndex = panels.findIndex(
        (panel) => panel.id === focusedPanelId,
      );
      const fallbackIndex = direction > 0 ? 0 : panels.length - 1;
      const nextIndex =
        currentIndex === -1
          ? fallbackIndex
          : (currentIndex + direction + panels.length) % panels.length;
      const nextPanel = panels[nextIndex];
      if (!nextPanel) {
        return;
      }

      focusPanel(activeSession.id, nextPanel.id);
      scrollPanelIntoView(nextPanel.id);
      requestPanelContentFocus(activeSession.id, nextPanel.id);
    },
    [
      activeFocusedPanelId,
      activeSession,
      focusPanel,
      getFocusedWorkspacePanelId,
      panelInstancesBySession,
      requestPanelContentFocus,
      scrollPanelIntoView,
    ],
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
      if (
        previous &&
        activeProject.sessions.some((session) => session.id === previous)
      ) {
        return previous;
      }

      return activeProject.sessions[0]?.id ?? null;
    });
  }, [activeProject]);

  useEffect(() => {
    setSessionNameDraft(activeSession?.name ?? "");
  }, [activeSession?.id, activeSession?.name]);

  useEffect(() => {
    setExpandedProjects((previous) => {
      const nextEntries = projects.map((project) => [
        project.id,
        previous[project.id] ?? project.id === activeProjectId,
      ]);
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
        [activeProjectId]: true,
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
        [activeSessionId]: createDefaultPanels(),
      };
    });

    setFocusedPanelIdBySession((previous) => {
      if (previous[activeSessionId]) {
        return previous;
      }

      const defaultPanels =
        panelInstancesBySession[activeSessionId] ?? createDefaultPanels();
      return {
        ...previous,
        [activeSessionId]: defaultPanels[0]?.id ?? null,
      };
    });
  }, [activeSessionId, panelInstancesBySession]);

  useEffect(() => {
    if (!activeSession || !activeFocusedPanelId) {
      return;
    }

    scrollPanelIntoView(activeFocusedPanelId);
  }, [activeFocusedPanelId, activePanels, activeSession, scrollPanelIntoView]);

  useEffect(() => {
    if (!activeSession || !activeFocusedPanelId) {
      return;
    }

    const focusedPanel = activePanels.find(
      (panel) => panel.id === activeFocusedPanelId,
    );
    if (
      !focusedPanel ||
      !["browser", "editor", "files", "terminal"].includes(focusedPanel.kind)
    ) {
      return;
    }

    focusPanelContent(activeSession.id, activeFocusedPanelId);
  }, [activeFocusedPanelId, activePanels, activeSession, focusPanelContent]);

  useEffect(() => {
    if (!panelFocusIntent) {
      return;
    }

    focusPanelContent(panelFocusIntent.sessionId, panelFocusIntent.panelId);
  }, [focusPanelContent, panelFocusIntent]);

  useEffect(() => {
    if (!resizingPanelId) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const currentResize = panelResizeStateRef.current;
      if (!currentResize) {
        return;
      }

      const nextWidth = Math.min(
        PANEL_MAX_WIDTH,
        Math.max(
          PANEL_MIN_WIDTH,
          currentResize.startWidth + event.clientX - currentResize.startX,
        ),
      );
      setPanelWidthsBySession((previous) => {
        const sessionWidths = previous[currentResize.sessionId] ?? {};
        if (sessionWidths[currentResize.panelId] === nextWidth) {
          return previous;
        }

        return {
          ...previous,
          [currentResize.sessionId]: {
            ...sessionWidths,
            [currentResize.panelId]: nextWidth,
          },
        };
      });
    };

    const stopResizing = () => {
      panelResizeStateRef.current = null;
      setResizingPanelId(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);
    window.addEventListener("blur", stopResizing);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
      window.removeEventListener("blur", stopResizing);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [resizingPanelId]);

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
    return () =>
      window.removeEventListener(PROJECTS_CHANGED_EVENT, syncProjects);
  }, [refreshProjects]);

  useEffect(() => {
    if (!window.bigIDE) {
      return;
    }

    const stopStatus = window.bigIDE.agent.onStatus((payload) => {
      if (payload.sessionId === activeSessionId) {
        setInfoMessage(
          `Agent ${payload.status}${payload.message ? `: ${payload.message}` : ""}`,
        );
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

      if (event.ctrlKey && event.altKey && key === "arrowup") {
        event.preventDefault();
        cycleSession(-1);
        return;
      }

      if (event.ctrlKey && event.altKey && key === "arrowdown") {
        event.preventDefault();
        cycleSession(1);
        return;
      }

      if (event.ctrlKey && event.altKey && key === "arrowleft") {
        event.preventDefault();
        cycleActivePanel(-1);
        return;
      }

      if (event.ctrlKey && event.altKey && key === "arrowright") {
        event.preventDefault();
        cycleActivePanel(1);
        return;
      }

      if (event.ctrlKey && event.altKey && key === "n") {
        event.preventDefault();
        openPanelDialog();
        return;
      }

      if (event.ctrlKey && event.altKey && key === "t") {
        event.preventDefault();
        openPanelDialog();
        return;
      }

      if (event.ctrlKey && event.altKey && key === "v") {
        if (!activeSession) {
          return;
        }

        const panelId = getFocusedWorkspacePanelId(activeSession.id, {
          requireDomFocus: true,
        });
        if (!panelId) {
          return;
        }

        event.preventDefault();
        closePanel(activeSession.id, panelId, {
          focusFallbackContent: true,
          selectFallback: true,
        });
        return;
      }

      if ((event.metaKey || event.ctrlKey) && key === "tab") {
        event.preventDefault();
        cycleSession(1);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    activeEditorPanel,
    activeProjectId,
    activeSession,
    closePanel,
    cycleActivePanel,
    cycleSession,
    getFocusedWorkspacePanelId,
    openPanelDialog,
    openSessionDialog,
    saveEditorFile,
  ]);

  const startPanelResize = useCallback(
    (
      event: ReactPointerEvent<HTMLButtonElement>,
      sessionId: string,
      panelId: string,
    ) => {
      const panelNode = panelRefs.current[panelId];
      if (!panelNode) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      panelResizeStateRef.current = {
        panelId,
        sessionId,
        startWidth: panelNode.getBoundingClientRect().width,
        startX: event.clientX,
      };
      setResizingPanelId(panelId);
    },
    [],
  );

  const renderDragHandle = useCallback(
    (label: string) => (
      <span
        className="inline-flex size-7 items-center justify-center text-muted-foreground"
        aria-hidden="true"
        title={`Drag ${label} panel`}
      >
        <GripHorizontal className="size-4" />
      </span>
    ),
    [],
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
          onClick={() => closePanel(activeSession.id, panel.id)}
          aria-label={`Close ${label} panel`}
        >
          <X className="size-4" />
        </Button>
      );
    },
    [activeSession, closePanel],
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
                onOpenFile={(filePath, options) =>
                  void openFile(filePath, options)
                }
                isLoading={treeLoading}
              />
            </PanelShell>
          );
        case "editor": {
          const editorFilePath = panel.filePath;
          const editorBuffer = editorFilePath
            ? (editorStateBySession[activeSession.id]?.buffers[
                editorFilePath
              ] ?? null)
            : null;
          const isFocusedEditor = panel.id === activeFocusedPanelId;
          return (
            <PanelShell
              title={editorFilePath ? fileLabel(editorFilePath) : "Editor"}
              subtitle={
                <span
                  {...(isFocusedEditor
                    ? { "data-testid": "editor-active-path" }
                    : {})}
                >
                  {editorFilePath
                    ? toRelativePathLabel(activeSession.workdir, editorFilePath)
                    : "Open files from the Files panel."}
                </span>
              }
              className="h-full min-h-0"
              actions={
                <>
                  {renderDragHandle(panelLabel)}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 rounded-none"
                    onClick={() =>
                      editorFilePath && void saveEditorFile(editorFilePath)
                    }
                    disabled={!editorFilePath || busyAction}
                    aria-label="Save file"
                  >
                    <Save className="size-4" />
                  </Button>
                  {renderClosePanelButton(panel, panelLabel)}
                </>
              }
            >
              <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
                <EditorPanel
                  filePath={editorFilePath}
                  value={editorBuffer?.value ?? ""}
                  registerFocusTarget={(focusTarget: (() => void) | null) => {
                    panelContentFocusRefs.current[panel.id] = focusTarget;
                  }}
                  onSave={
                    editorFilePath
                      ? () => void saveEditorFile(editorFilePath)
                      : undefined
                  }
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
                          dirty: true,
                        },
                      },
                    }));
                  }}
                />
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
              <div className="h-full min-h-0 bg-card">
                <TerminalPanel
                  session={activeSession}
                  registerFocusTarget={(focusTarget: (() => void) | null) => {
                    panelContentFocusRefs.current[panel.id] = focusTarget;
                  }}
                />
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
                      <Badge
                        variant="outline"
                        className="rounded-none px-2 py-0"
                      >
                        <GitBranch className="mr-1 size-3.5" />
                        {gitStatus.branch ?? "detached"}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className="rounded-none px-2 py-0"
                      >
                        +{gitStatus.ahead} / -{gitStatus.behind}
                      </Badge>
                      {selectedGitEntry ? (
                        <Badge
                          variant={
                            selectedGitEntry.staged
                              ? "success"
                              : selectedGitEntry.untracked
                                ? "warning"
                                : "outline"
                          }
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
                              gitEntryClass(entry),
                            )}
                          >
                            <Badge
                              variant={
                                entry.staged
                                  ? "success"
                                  : entry.untracked
                                    ? "warning"
                                    : "outline"
                              }
                              className="shrink-0 rounded-none px-2 py-0"
                            >
                              {entry.displayStatus}
                            </Badge>
                            <span className="truncate">{entry.path}</span>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-4 text-sm text-muted-foreground">
                          Working tree clean.
                        </div>
                      )}
                    </div>

                    <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                      Latest commit:{" "}
                      {gitStatus.latestCommit ?? "no commits yet"}
                    </div>
                    <div className="grid gap-px border-t border-border bg-border sm:grid-cols-3">
                      <Button
                        data-testid="git-stage-button"
                        type="button"
                        variant="secondary"
                        className="rounded-none bg-secondary"
                        onClick={() => void stageGitSelection()}
                        disabled={
                          gitBusyAction !== null || !gitStatus.files.length
                        }
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
                        disabled={
                          gitBusyAction !== null ||
                          !gitStatus.isRepo ||
                          !hasStagedChanges
                        }
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
              className="h-full min-h-0"
              headerContent={
                <form
                  className="flex min-w-0 items-center gap-px"
                  onSubmit={openWebView}
                >
                  <div className="relative min-w-0 flex-1">
                    <Input
                      data-testid="web-url-input"
                      value={webDraftUrl}
                      onChange={(event) => setWebDraftUrl(event.target.value)}
                      placeholder={DEFAULT_BROWSER_URL}
                      aria-label="Browser address"
                      className="h-8 rounded-none pr-11 text-xs"
                    />
                    {showWebOpenButton ? (
                      <Button
                        data-testid="web-open-button"
                        type="submit"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 size-6 -translate-y-1/2 rounded-none"
                        aria-label={`Navigate to ${normalizedWebDraftUrl}`}
                        title={`Navigate to ${normalizedWebDraftUrl} (Enter)`}
                      >
                        <ArrowRight className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                </form>
              }
              actions={
                <>
                  {renderDragHandle(panelLabel)}
                  {renderClosePanelButton(panel, panelLabel)}
                </>
              }
            >
              <div className="flex h-full min-h-0 flex-col">
                <span data-testid="web-status" className="sr-only">
                  status: {webState}
                </span>

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
      showWebOpenButton,
      stageGitSelection,
      treeLoading,
      treeNodes,
      normalizedWebDraftUrl,
      webDraftUrl,
      webState,
      webUrl,
    ],
  );

  if (!window.bigIDE) {
    return (
      <main className="flex h-full items-center justify-center bg-background p-6">
        <div className="w-full max-w-lg border border-border bg-background">
          <div className="border-b border-border px-4 py-3">
            <h1 className="text-base font-semibold">Backend unavailable</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Use `npm run dev` or `npm run dev:web` to connect the workspace
              runtime.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const sessionCreationProject =
    projects.find((project) => project.id === sessionCreationProjectId) ?? null;
  const statusNotice =
    errorMessage ||
    (infoMessage !== "Workspace ready" &&
    infoMessage !== "Initializing workspace..."
      ? infoMessage
      : "");

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground md:flex-row">
      <aside
        className={cn(
          "flex h-full min-h-0 w-full flex-col border-b border-border bg-card md:border-b-0 md:border-r",
          isProjectsSidebarCollapsed
            ? "md:w-20 md:min-w-[5rem]"
            : "md:w-[20rem] md:min-w-[20rem]",
        )}
      >
        <div
          className={cn(
            "border-b border-border px-4 py-3",
            isProjectsSidebarCollapsed && "md:px-2",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 rounded-none"
                aria-label={
                  isProjectsSidebarCollapsed
                    ? "Expand projects panel"
                    : "Collapse projects panel"
                }
                title={
                  isProjectsSidebarCollapsed
                    ? "Expand projects panel"
                    : "Collapse projects panel"
                }
                onClick={() =>
                  setIsProjectsSidebarCollapsed((current) => !current)
                }
              >
                {isProjectsSidebarCollapsed ? (
                  <PanelLeftOpen className="size-4" />
                ) : (
                  <PanelLeftClose className="size-4" />
                )}
              </Button>
              {!isProjectsSidebarCollapsed && (
                <h1
                  data-testid="workspace-app-title"
                  className={cn(
                    "truncate text-lg font-semibold tracking-tight",
                    isProjectsSidebarCollapsed && "md:hidden",
                  )}
                >
                  The Big IDE
                </h1>
              )}
            </div>
            <Button
              data-testid="new-project-button"
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                "shrink-0 rounded-none px-2.5",
                isProjectsSidebarCollapsed && "md:size-8 md:px-0",
              )}
              onClick={openProjectDialog}
              title="Create project"
            >
              <Plus className="size-3.5" />
              {!isProjectsSidebarCollapsed && (
                <span className="ml-1.5">New Project</span>
              )}
            </Button>
          </div>
        </div>

        <nav
          aria-label="Projects and sessions"
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain py-3",
            isProjectsSidebarCollapsed ? "px-2" : "px-3",
          )}
        >
          {!projects.length ? (
            <p className="px-1 text-sm text-muted-foreground">
              No projects yet.
            </p>
          ) : null}

          {isProjectsSidebarCollapsed ? (
            <ul className="space-y-2">
              {projects.map((project) => {
                const isActiveProject = project.id === activeProjectId;
                const activeProjectSession = isActiveProject
                  ? (project.sessions.find(
                      (session) => session.id === activeSessionId,
                    ) ??
                    project.sessions[0] ??
                    null)
                  : null;

                return (
                  <li key={project.id}>
                    <button
                      type="button"
                      aria-current={isActiveProject ? "page" : undefined}
                      className={cn(
                        "flex w-full flex-col items-center gap-1 border border-border px-2 py-2 text-center text-[11px] font-medium transition-colors hover:bg-muted/40",
                        isActiveProject &&
                          "border-primary/40 bg-muted/50 text-primary",
                      )}
                      title={
                        activeProjectSession
                          ? `${project.name} · ${activeProjectSession.name}`
                          : project.name
                      }
                      onClick={() => {
                        setActiveProjectId(project.id);
                        setActiveSessionId(
                          project.id === activeProjectId
                            ? activeSessionId
                            : (project.sessions[0]?.id ?? null),
                        );
                      }}
                    >
                      <span className="inline-flex size-9 items-center justify-center border border-border bg-background text-xs font-semibold uppercase tracking-[0.18em]">
                        {projectCompactLabel(project.name)}
                      </span>
                      <span className="w-full truncate text-[10px] text-muted-foreground">
                        {project.sessions.length || 0} sess
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="space-y-1.5">
              {projects.map((project) => {
                const isActiveProject = project.id === activeProjectId;
                const isExpanded =
                  expandedProjects[project.id] ?? isActiveProject;

                return (
                  <li
                    key={project.id}
                    className="border-b border-border/80 pb-1 last:border-b-0"
                  >
                    <div
                      className={cn(
                        "flex items-center gap-1.5 px-1 py-1.5",
                        isActiveProject && "bg-muted/40",
                      )}
                    >
                      <button
                        type="button"
                        className="inline-flex size-7 shrink-0 items-center justify-center rounded-none text-muted-foreground transition-colors hover:text-foreground"
                        aria-label={`${isExpanded ? "Collapse" : "Expand"} ${project.name}`}
                        aria-expanded={isExpanded}
                        onClick={() => {
                          setExpandedProjects((previous) => ({
                            ...previous,
                            [project.id]: !isExpanded,
                          }));
                        }}
                      >
                        {isExpanded ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        aria-current={isActiveProject ? "page" : undefined}
                        className={cn(
                          "min-w-0 flex-1 truncate text-left text-sm font-medium transition-colors hover:text-primary",
                          isActiveProject && "text-primary",
                        )}
                        onClick={() => {
                          setExpandedProjects((previous) => ({
                            ...previous,
                            [project.id]: true,
                          }));
                          setActiveProjectId(project.id);
                          setActiveSessionId(
                            project.id === activeProjectId
                              ? activeSessionId
                              : (project.sessions[0]?.id ?? null),
                          );
                        }}
                      >
                        {project.name}
                      </button>
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
                            const isActiveSession =
                              session.id === activeSessionId;

                            return (
                              <button
                                data-testid="session-row"
                                data-session-name={session.name}
                                data-session-status={session.status}
                                type="button"
                                key={session.id}
                                className={cn(
                                  "mt-1 flex w-full items-center justify-between gap-3 px-2 py-2 text-left transition-colors hover:bg-muted/50",
                                  isActiveSession && "bg-muted/50",
                                )}
                                onClick={() => {
                                  setExpandedProjects((previous) => ({
                                    ...previous,
                                    [project.id]: true,
                                  }));
                                  setActiveProjectId(project.id);
                                  setActiveSessionId(session.id);
                                }}
                              >
                                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                                  {session.name}
                                </span>
                                <Badge
                                  variant={sessionStatusVariant(session)}
                                  className="shrink-0 rounded-none px-2 py-0 text-[10px] uppercase tracking-[0.12em]"
                                >
                                  {session.status}
                                </Badge>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="ml-4 border-l border-border/80 px-2 py-2 text-xs text-muted-foreground">
                          No sessions yet.
                        </div>
                      )
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        {isProjectsSidebarCollapsed ? (
          <div className="border-t border-border px-2 py-2 md:block">
            <div className="border border-border bg-background px-2 py-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <div className="truncate text-foreground">
                {activeProject?.name ?? "No project"}
              </div>
              <div className="mt-1 truncate">
                {activeSession?.name ?? "No session"}
              </div>
            </div>
          </div>
        ) : null}
      </aside>

      <section className="flex h-full min-h-0 flex-1 overflow-hidden">
        <div
          data-testid="session-panel-area"
          className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background"
        >
          {statusNotice ? (
            <div
              className={cn(
                "border-b border-border px-4 py-2 text-sm",
                errorMessage ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {statusNotice}
            </div>
          ) : null}
          {!activeSession ? (
            <>
              <div className="border-b border-border px-4 py-4">
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Session workspace
                </h2>
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
                  <p className="text-lg font-semibold tracking-tight text-foreground">
                    No session selected
                  </p>
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
              <div className="border-b border-border p-2">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="min-w-0">
                      <input
                        data-testid="active-session-label"
                        type="text"
                        value={sessionNameDraft}
                        onChange={(event) =>
                          setSessionNameDraft(event.target.value)
                        }
                        onBlur={() => void renameActiveSession()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            event.currentTarget.blur();
                            return;
                          }

                          if (event.key === "Escape") {
                            event.preventDefault();
                            setSessionNameDraft(activeSession.name);
                            event.currentTarget.blur();
                          }
                        }}
                        disabled={busyAction}
                        spellCheck={false}
                        className="h-auto w-full min-w-0 border-0 bg-transparent px-0 py-0 text-base font-semibold tracking-tight shadow-none outline-none ring-0 placeholder:text-muted-foreground/70 focus-visible:ring-0 focus-visible:ring-offset-0 lg:text-[15px]"
                      />
                    </div>
                    <div className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
                      <Badge
                        variant="outline"
                        title={activeProject?.name}
                        className="min-w-0 max-w-[12rem] rounded-none px-2 py-0 text-[10px] uppercase tracking-[0.12em]"
                      >
                        <span className="truncate">{activeProject?.name}</span>
                      </Badge>
                      <Badge
                        variant={sessionStatusVariant(activeSession)}
                        title={activeSession.status}
                        className="min-w-0 max-w-[10rem] rounded-none px-2 py-0 text-[10px] uppercase tracking-[0.12em]"
                      >
                        <span className="truncate">{activeSession.status}</span>
                      </Badge>
                      <Badge
                        variant={agentStatusVariant(activeSession.agentStatus)}
                        title={`OpenCode ${formatAgentStatus(activeSession.agentStatus)}`}
                        className="min-w-0 max-w-[14rem] rounded-none px-2 py-0 text-[10px] uppercase tracking-[0.12em]"
                      >
                        <span className="truncate">
                          OpenCode{" "}
                          {formatAgentStatus(activeSession.agentStatus)}
                        </span>
                      </Badge>
                    </div>
                  </div>

                  <div className="flex min-w-0 items-center gap-2 overflow-x-auto whitespace-nowrap lg:justify-end">
                    <Button
                      data-testid="start-session-button"
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0 rounded-none px-3"
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
                      variant="outline"
                      className="shrink-0 rounded-none px-3"
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
                      className="shrink-0 rounded-none px-3"
                      onClick={openPanelDialog}
                      title="Add panel (Ctrl+Alt+T)"
                    >
                      <Plus className="mr-1.5 size-3.5" />
                      New Panel
                    </Button>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden">
                {activePanels.length ? (
                  <div
                    data-testid="session-panel-scroll-region"
                    className="h-full min-h-0 overflow-x-auto overflow-y-hidden overscroll-contain"
                  >
                    <div
                      data-testid="session-panel-rail"
                      className="flex h-full w-max min-w-full flex-nowrap items-stretch gap-3 p-2 "
                    >
                      {activePanels.map((panel) => (
                        <div
                          data-testid="session-panel"
                          data-panel-id={panel.kind}
                          data-panel-instance-id={panel.id}
                          data-file-path={panel.filePath ?? undefined}
                          key={panel.id}
                          ref={(node) => {
                            panelRefs.current[panel.id] = node;
                          }}
                          tabIndex={-1}
                          draggable
                          onClick={() => focusPanel(activeSession.id, panel.id)}
                          onFocusCapture={() =>
                            focusPanel(activeSession.id, panel.id)
                          }
                          onDragStart={(event) => {
                            if (
                              (event.target as HTMLElement).closest(
                                '[data-panel-resize-handle="true"]',
                              )
                            ) {
                              event.preventDefault();
                              return;
                            }

                            draggedPanelIdRef.current = panel.id;
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", panel.id);
                            setDraggedPanelId(panel.id);
                            focusPanel(activeSession.id, panel.id);
                          }}
                          onDragEnter={(event) => {
                            const sourcePanelId = draggedPanelIdRef.current;
                            if (!sourcePanelId || sourcePanelId === panel.id) {
                              return;
                            }

                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                          }}
                          onDragOver={(event) => {
                            const sourcePanelId = draggedPanelIdRef.current;
                            if (!sourcePanelId || sourcePanelId === panel.id) {
                              return;
                            }

                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            const sourcePanelId =
                              event.dataTransfer.getData("text/plain") ||
                              draggedPanelIdRef.current;
                            if (!sourcePanelId || sourcePanelId === panel.id) {
                              return;
                            }

                            moveSessionPanel(
                              activeSession.id,
                              sourcePanelId,
                              panel.id,
                            );
                            draggedPanelIdRef.current = null;
                            setDraggedPanelId(null);
                          }}
                          onDragEnd={() => {
                            draggedPanelIdRef.current = null;
                            setDraggedPanelId(null);
                          }}
                          style={
                            activePanelWidths[panel.id]
                              ? { width: `${activePanelWidths[panel.id]}px` }
                              : undefined
                          }
                          className={cn(
                            "group relative h-full min-h-0 w-[22rem] shrink-0 sm:w-[24rem] lg:w-[28rem] xl:w-[30rem]",
                            panel.id === activeFocusedPanelId &&
                              "ring-2 ring-primary/25 ring-offset-2 ring-offset-background",
                            draggedPanelId === panel.id && "opacity-70",
                            resizingPanelId === panel.id &&
                              "ring-2 ring-primary/30 ring-offset-2 ring-offset-background",
                          )}
                        >
                          {renderPanel(panel)}
                          <button
                            type="button"
                            data-panel-resize-handle="true"
                            className="absolute inset-y-0 right-0 z-10 hidden w-3 cursor-col-resize touch-none md:flex md:items-center md:justify-center"
                            aria-label={`Resize ${PANEL_LABELS[panel.kind]} panel`}
                            onClick={(event) => event.stopPropagation()}
                            onPointerDown={(event) =>
                              startPanelResize(
                                event,
                                activeSession.id,
                                panel.id,
                              )
                            }
                          >
                            <span
                              className={cn(
                                "pointer-events-none h-16 w-px bg-border/70 transition-colors group-hover:bg-primary/50",
                                resizingPanelId === panel.id && "bg-primary/70",
                              )}
                            />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="m-3 flex h-full min-h-0 items-center justify-center border border-dashed border-border px-6 text-center">
                    <div className="max-w-sm space-y-3">
                      <p className="text-base font-semibold">No panels open</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-none"
                        onClick={openPanelDialog}
                        title="Add panel (Ctrl+Alt+T)"
                      >
                        <Plus className="mr-1.5 size-3.5" />
                        New Panel
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
            <DialogDescription>
              Add a project to the workspace. New sessions can then be created
              from the project card.
            </DialogDescription>
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
              <Button
                type="button"
                variant="outline"
                className="rounded-none"
                onClick={() => setIsProjectDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                data-testid="create-project-button"
                type="submit"
                className="rounded-none"
                disabled={busyAction || !newProjectName.trim()}
              >
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
              {sessionCreationProject
                ? `Create a new session inside ${sessionCreationProject.name}.`
                : "Choose a project first."}
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
              <Button
                type="button"
                variant="outline"
                className="rounded-none"
                onClick={() => setIsSessionDialogOpen(false)}
              >
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
        <DialogContent
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            window.requestAnimationFrame(() => focusPanelOption(0));
          }}
        >
          <DialogHeader>
            <DialogTitle>Add panel</DialogTitle>
            <DialogDescription>
              Create another panel in the current session. Editor panels open
              from Files when you open a file.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            {NEW_PANEL_OPTIONS.map((option, index) => (
              <button
                key={option.kind}
                data-testid={`new-panel-option-${option.kind}`}
                ref={(node) => {
                  panelOptionRefs.current[index] = node;
                }}
                type="button"
                className="grid gap-1 border border-border px-3 py-3 text-left transition-colors hover:bg-muted/30"
                onKeyDown={(event) => handlePanelOptionKeyDown(event, index)}
                onClick={() => addPanelToActiveSession(option.kind)}
              >
                <span className="text-sm font-semibold">{option.label}</span>
                <span className="text-xs text-muted-foreground">
                  {option.description}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isCommitDialogOpen} onOpenChange={setIsCommitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create commit</DialogTitle>
            <DialogDescription>
              Use a concise message that explains why the staged changes belong
              together.
            </DialogDescription>
          </DialogHeader>

          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void commitGitChanges();
            }}
          >
            <Input
              value={commitMessage}
              onChange={(event) => setCommitMessage(event.target.value)}
              placeholder="chore: update session state"
              className="rounded-none"
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="rounded-none"
                onClick={() => setIsCommitDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="rounded-none"
                disabled={gitBusyAction === "commit" || !commitMessage.trim()}
              >
                Create commit
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
