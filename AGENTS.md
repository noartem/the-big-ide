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
- Pushing `main` automatically checks the version in `package.json`, creates a tag if needed, and completes the desktop/npm release in the same workflow run.
- Tag pushes like `v0.1.0` can also run the same release pipeline directly.
- Manual `workflow_dispatch` runs the same version-based release flow without requiring a separate tag push.
- The latest GitHub Release gets a managed notes block with install/download details, and older releases are marked as archived prereleases.
- Set `NPM_TOKEN` in repository secrets before using tag-based releases.
- Desktop artifacts are currently published without code signing or notarization.

## Runtime notes

- Electron mode uses local workspaces in `~/.big-ide/sessions`, creates `.sandbox` templates for each session, and starts/stops sandbox containers via Docker Compose.
- Web mode uses `server/web-backend.cjs` and the same runtime model via HTTP + SSE bridge (`VITE_BIGIDE_BACKEND_URL` can override backend URL).
- Terminal and OpenCode agent run inside the session sandbox container when Docker mode is enabled, with host fallback.
- Backend state for web mode is persisted at `~/.big-ide/state.web.json`.
