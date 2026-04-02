import { contextBridge, ipcRenderer } from "electron";

const PROJECTS_CHANGED_EVENT = "bigide:projects-changed";

function notifyProjectsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PROJECTS_CHANGED_EVENT));
  }
}

contextBridge.exposeInMainWorld("bigIDE", {
  bootstrap: () => ipcRenderer.invoke("ide:bootstrap"),
  projects: {
    list: () => ipcRenderer.invoke("projects:list"),
    create: async (payload) => {
      const project = await ipcRenderer.invoke("projects:create", payload);
      notifyProjectsChanged();
      return project;
    },
    updateSandbox: async (payload) => {
      const project = await ipcRenderer.invoke("projects:update-sandbox", payload);
      notifyProjectsChanged();
      return project;
    }
  },
  sessions: {
    create: async (payload) => {
      const session = await ipcRenderer.invoke("sessions:create", payload);
      notifyProjectsChanged();
      return session;
    },
    rename: async (payload) => {
      const session = await ipcRenderer.invoke("sessions:rename", payload);
      notifyProjectsChanged();
      return session;
    },
    start: async (payload) => {
      const session = await ipcRenderer.invoke("sessions:start", payload);
      notifyProjectsChanged();
      return session;
    },
    stop: async (payload) => {
      const session = await ipcRenderer.invoke("sessions:stop", payload);
      notifyProjectsChanged();
      return session;
    }
  },
  fs: {
    readTree: (payload) => ipcRenderer.invoke("fs:tree", payload),
    readFile: (payload) => ipcRenderer.invoke("fs:read-file", payload),
    writeFile: (payload) => ipcRenderer.invoke("fs:write-file", payload)
  },
  terminal: {
    start: (payload) => ipcRenderer.invoke("terminal:start", payload),
    write: (payload) => ipcRenderer.invoke("terminal:write", payload),
    stop: (payload) => ipcRenderer.invoke("terminal:stop", payload),
    onData: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("terminal:data", listener);
      return () => ipcRenderer.removeListener("terminal:data", listener);
    },
    onExit: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("terminal:exit", listener);
      return () => ipcRenderer.removeListener("terminal:exit", listener);
    }
  },
  agent: {
    onLog: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("agent:log", listener);
      return () => ipcRenderer.removeListener("agent:log", listener);
    },
    onStatus: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("agent:status", listener);
      return () => ipcRenderer.removeListener("agent:status", listener);
    }
  },
  git: {
    status: (payload) => ipcRenderer.invoke("git:status", payload),
    stage: (payload) => ipcRenderer.invoke("git:stage", payload),
    discard: (payload) => ipcRenderer.invoke("git:discard", payload),
    commit: (payload) => ipcRenderer.invoke("git:commit", payload)
  }
});
