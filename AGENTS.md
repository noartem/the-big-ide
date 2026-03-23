# AGENTS.md

## Project overview

The Big IDE is a project/session-first coding environment that runs in both Electron and a standalone web browser mode.

## Stack

- Electron
- React + TypeScript + Vite
- Tailwind + shadcn-style UI primitives
- CodeMirror
- xterm.js

## Local development

### Run (Electron)

```bash
npm install
npm run dev
```

### Run (Web only)

```bash
npm install
npm run dev:web
```

Web mode runs with a local backend service that executes the same OS-level operations as Electron mode.

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
- Tag pushes like `v0.1.0` create a GitHub Release and publish `the-big-ide` to npm.
- Manual `workflow_dispatch` creates and pushes a git tag automatically from the version in `package.json`; that new tag then triggers the release pipeline.
- Set `NPM_TOKEN` in repository secrets before using tag-based releases.
- Desktop artifacts are currently published without code signing or notarization.

## Runtime notes

- Electron mode uses local workspaces in `~/.big-ide/sessions`, creates `.sandbox` templates for each session, and starts/stops sandbox containers via Docker Compose.
- Web mode uses `server/web-backend.cjs` and the same runtime model via HTTP + SSE bridge (`VITE_BIGIDE_BACKEND_URL` can override backend URL).
- Terminal and OpenCode agent run inside the session sandbox container when Docker mode is enabled, with host fallback.
- Backend state for web mode is persisted at `~/.big-ide/state.web.json`.
