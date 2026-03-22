import type { BigIDEApi, Project, Session } from "@/types/big-ide";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:43111";
const PROJECTS_CHANGED_EVENT = "bigide:projects-changed";

type BackendEventMap = {
  "terminal:data": { sessionId: string; data: string };
  "terminal:exit": { sessionId: string; code: number | null; signal: NodeJS.Signals | null };
  "agent:log": { sessionId: string; stream: "stdout" | "stderr"; chunk: string };
  "agent:status": { sessionId: string; status: string; code?: number | null; message?: string };
};

interface InvokeSuccess<TData> {
  ok: true;
  data: TData;
}

interface InvokeFailure {
  ok: false;
  error: string;
}

type InvokeResponse<TData> = InvokeSuccess<TData> | InvokeFailure;

function resolveBackendUrl() {
  const envUrl = import.meta.env.VITE_BIGIDE_BACKEND_URL;
  return (envUrl && envUrl.trim()) || DEFAULT_BACKEND_URL;
}

function createEventHub(backendUrl: string) {
  let source: EventSource | null = null;

  const listeners: {
    [K in keyof BackendEventMap]: Set<(payload: BackendEventMap[K]) => void>;
  } = {
    "terminal:data": new Set(),
    "terminal:exit": new Set(),
    "agent:log": new Set(),
    "agent:status": new Set()
  };

  function dispatch<K extends keyof BackendEventMap>(event: K, payload: BackendEventMap[K]) {
    for (const listener of listeners[event]) {
      listener(payload);
    }
  }

  function hasListeners() {
    return Object.values(listeners).some((set) => set.size > 0);
  }

  function closeIfUnused() {
    if (!source || hasListeners()) {
      return;
    }
    source.close();
    source = null;
  }

  function ensureSource() {
    if (source) {
      return;
    }

    source = new EventSource(`${backendUrl}/api/events`);

    (Object.keys(listeners) as (keyof BackendEventMap)[]).forEach((eventName) => {
      source?.addEventListener(eventName, (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as BackendEventMap[typeof eventName];
          dispatch(eventName, payload);
        } catch {
          // ignore malformed payloads
        }
      });
    });

    source.onerror = () => {
      // EventSource reconnects automatically.
    };
  }

  function subscribe<K extends keyof BackendEventMap>(
    event: K,
    callback: (payload: BackendEventMap[K]) => void
  ): () => void {
    listeners[event].add(callback);
    ensureSource();

    return () => {
      listeners[event].delete(callback);
      closeIfUnused();
    };
  }

  return {
    subscribe
  };
}

async function invoke<TData>(backendUrl: string, method: string, payload?: unknown): Promise<TData> {
  const response = await fetch(`${backendUrl}/api/invoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      method,
      payload: payload ?? {}
    })
  });

  let body: InvokeResponse<TData>;

  try {
    body = (await response.json()) as InvokeResponse<TData>;
  } catch {
    throw new Error(`Backend returned invalid JSON for ${method}`);
  }

  if (!response.ok || !body.ok) {
    const reason = body.ok ? `HTTP ${response.status}` : body.error;
    throw new Error(reason || `Backend request failed for ${method}`);
  }

  return body.data;
}

function notifyProjectsChanged() {
  window.dispatchEvent(new CustomEvent(PROJECTS_CHANGED_EVENT));
}

export function createWebBigIDEApi(): BigIDEApi {
  const backendUrl = resolveBackendUrl();
  const events = createEventHub(backendUrl);

  return {
    bootstrap: () => invoke(backendUrl, "ide:bootstrap"),
    projects: {
      list: () => invoke(backendUrl, "projects:list"),
      create: async (payload) => {
        const project = await invoke<Project>(backendUrl, "projects:create", payload);
        notifyProjectsChanged();
        return project;
      },
      updateSandbox: async (payload) => {
        const project = await invoke<Project>(backendUrl, "projects:update-sandbox", payload);
        notifyProjectsChanged();
        return project;
      }
    },
    sessions: {
      create: async (payload) => {
        const session = await invoke<Session>(backendUrl, "sessions:create", payload);
        notifyProjectsChanged();
        return session;
      },
      start: async (payload) => {
        const session = await invoke<Session>(backendUrl, "sessions:start", payload);
        notifyProjectsChanged();
        return session;
      },
      stop: async (payload) => {
        const session = await invoke<Session>(backendUrl, "sessions:stop", payload);
        notifyProjectsChanged();
        return session;
      }
    },
    fs: {
      readTree: (payload) => invoke(backendUrl, "fs:tree", payload),
      readFile: (payload) => invoke(backendUrl, "fs:read-file", payload),
      writeFile: (payload) => invoke(backendUrl, "fs:write-file", payload)
    },
    terminal: {
      start: (payload) => invoke(backendUrl, "terminal:start", payload),
      write: (payload) => invoke(backendUrl, "terminal:write", payload),
      stop: (payload) => invoke(backendUrl, "terminal:stop", payload),
      onData: (callback) => events.subscribe("terminal:data", callback),
      onExit: (callback) => events.subscribe("terminal:exit", callback)
    },
    agent: {
      onLog: (callback) => events.subscribe("agent:log", callback),
      onStatus: (callback) => events.subscribe("agent:status", callback)
    },
    git: {
      status: (payload) => invoke(backendUrl, "git:status", payload),
      stage: (payload) => invoke(backendUrl, "git:stage", payload),
      discard: (payload) => invoke(backendUrl, "git:discard", payload),
      commit: (payload) => invoke(backendUrl, "git:commit", payload)
    }
  };
}
