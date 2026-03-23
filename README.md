# The Big IDE (Prototype)

The Big IDE is a project/session-first coding environment that now runs in both Electron and a standalone web browser mode.

## What this prototype includes

- Project registry with per-project sandbox specification.
- Session lifecycle with isolated workspace strategy (`git worktree` when possible, fallback copy) and generated `.sandbox` scaffolding per session.
- Multi-panel workspace (projects, file tree, editor, browser, agent logs, terminal).
- File browsing + file editing with CodeMirror.
- Built-in shell terminal for each session (real OS shell in both Electron and web mode).
- Sandbox bootstrap logic with Docker Compose session sandbox (`.sandbox/compose.yml` + `.sandbox/Dockerfile`) and host fallback.
- OpenCode server bootstrap (best-effort in both Electron and web mode).
- Keyboard shortcuts for switching sessions/panels and saving files.

## Stack

- Electron
- React + TypeScript + Vite
- Tailwind + shadcn-style UI primitives
- CodeMirror
- xterm.js

## Run (Electron)

```bash
npm install
npm run dev
```

## Run (Web only)

```bash
npm install
npm run dev:web
```

Web mode runs with a local backend service that executes the same OS-level operations as Electron mode (filesystem, Docker Compose sandbox, terminal, OpenCode process).

## Build

```bash
npm run build
```

## Desktop release build

```bash
npm run build:app
```

This creates desktop artifacts in `release/` for the current OS via `electron-builder`.

## Release automation

- GitHub Actions builds desktop packages on Linux, Windows, and macOS.
- Tagged releases create a GitHub Release and attach the packaged desktop artifacts.
- Pushing a tag like `v0.1.0` also publishes `the-big-ide` to npm.
- Set `NPM_TOKEN` in GitHub repository secrets before using tag-based releases.

## Notes

- Electron mode uses real local workspaces in `~/.big-ide/sessions`, creates `.sandbox` templates for each session, and starts/stops sandbox containers via Docker Compose.
- Web mode uses `server/web-backend.cjs` and the same runtime model via HTTP + SSE bridge (`VITE_BIGIDE_BACKEND_URL` can override backend URL).
- Terminal and OpenCode agent run inside the session sandbox container when Docker mode is enabled (fallback to host mode if unavailable).
- Backend state for web mode is persisted at `~/.big-ide/state.web.json`.
