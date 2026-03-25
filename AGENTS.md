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

<!-- repo-task-proof-loop:start -->
## Repo task proof loop

For substantial features, refactors, and bug fixes, use the repo-task-proof-loop workflow.

Required artifact path:
- Keep all task artifacts in `.agent/tasks/<TASK_ID>/` inside this repository.

Required sequence:
1. Freeze `.agent/tasks/<TASK_ID>/spec.md` before implementation.
2. Implement against explicit acceptance criteria (`AC1`, `AC2`, ...).
3. Create `evidence.md`, `evidence.json`, and raw artifacts.
4. Run a fresh verification pass against the current codebase and rerun checks.
5. If verification is not `PASS`, write `problems.md`, apply the smallest safe fix, and reverify.

Hard rules:
- Do not claim completion unless every acceptance criterion is `PASS`.
- Verifiers judge current code and current command results, not prior chat claims.
- Fixers should make the smallest defensible diff.

Installed workflow agents:
- `.opencode/agents/task-spec-freezer.md`
- `.opencode/agents/task-builder.md`
- `.opencode/agents/task-verifier.md`
- `.opencode/agents/task-fixer.md`
<!-- repo-task-proof-loop:end -->
