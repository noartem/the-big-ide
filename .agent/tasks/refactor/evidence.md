# Evidence Bundle: refactor

## Summary
- Overall status: PASS
- Last updated: 2026-03-26T00:00:00+00:00
- Implementation updates the workspace shell, panel system, editor/file behavior, and Playwright coverage without changing backend integration contracts.

## Acceptance criteria evidence

### AC1
- Status: PASS
- Proof:
  - `src/App.tsx:1308` renders the sidebar header from `activeProject?.name` with a neutral fallback, removing the old stacked `Projects / Workspace / <runtime> mode` labels.
  - `src/App.tsx:1314` keeps only the compact project action button in that header area.
- Gaps:
  - None.

### AC2
- Status: PASS
- Proof:
  - `src/App.tsx:1314` adds the compact `[+ New Project]` launcher.
  - `src/App.tsx:1605` keeps project creation in a modal using `project-name-input` and the existing `window.bigIDE.projects.create` flow.
  - `e2e/usage-recordings.spec.ts:18` and `.agent/tasks/refactor/raw/test-integration.txt` cover opening the modal and creating a project through the new UI.
- Gaps:
  - None.

### AC3
- Status: PASS
- Proof:
  - `src/App.tsx:1364` moves session creation into each project card with a per-project `new-session-button`.
  - `src/App.tsx:1635` keeps session naming/submission inside a modal and targets the selected project id.
  - `e2e/usage-recordings.spec.ts:26` plus `.agent/tasks/refactor/raw/test-integration.txt` verify the per-project session creation flow and lifecycle actions.
- Gaps:
  - None.

### AC4
- Status: PASS
- Proof:
  - `server/web-backend.js:38` initializes persisted state with `projects: []`.
  - `electron/main.js:35` initializes persisted state with `projects: []`.
  - `src/App.tsx:164` removes the old default project name seed from UI state, so the refactor does not introduce placeholder projects.
- Gaps:
  - None.

### AC5
- Status: PASS
- Proof:
  - `src/App.tsx:264` now uses the neutral message `Workspace ready` for bootstrap feedback.
  - `rg -n "Web runtime ready" src server electron e2e .agent/tasks/refactor` returned matches only in `spec.md`, confirming the literal is gone from app/runtime sources.
- Gaps:
  - None.

### AC6
- Status: PASS
- Proof:
  - `src/App.tsx:1425` removes the old `section` padding by switching to a bare `min-h-0 flex-1` wrapper.
  - `src/App.tsx:1426` and `src/App.tsx:1535` keep the session area/rail scrollable without the old stacked shell padding and redundant strip.
- Gaps:
  - None.

### AC7
- Status: PASS
- Proof:
  - `src/App.tsx:1458` keeps the session title on its own line, and `src/App.tsx:1468` / `src/App.tsx:1470` place compact badges underneath it.
  - `src/App.tsx:1495` and `src/App.tsx:1506` switch Start/Stop to compact `size="sm"` buttons.
  - `.agent/tasks/refactor/raw/test-integration.txt` confirms session lifecycle still works from the updated header.
- Gaps:
  - None.

### AC8
- Status: PASS
- Proof:
  - `src/App.tsx:1518` replaces the old strip with a `[+ New Panel]` entry point.
  - `src/App.tsx:1671` defines the modal panel creation options used by that button.
  - `rg -n "panel-toggle-|Agent pinned|editor-tabs|editor-tab" src e2e/usage-recordings.spec.ts` returned no old panel-strip hooks in `src/`, and the only remaining `editor-tabs` match is the new Playwright assertion that tabs are absent.
- Gaps:
  - None.

### AC9
- Status: PASS
- Proof:
  - `src/App.tsx:156`, `src/App.tsx:306`, and `src/App.tsx:319` replace single-instance panel toggles with per-session arrays of unique panel instances plus per-instance closing.
  - `e2e/usage-recordings.spec.ts:115` and `e2e/usage-recordings.spec.ts:124` plus `.agent/tasks/refactor/raw/test-integration.txt` verify that the agent panel can be closed/reopened and that duplicate Files panels can exist.
- Gaps:
  - None.

### AC10
- Status: PASS
- Proof:
  - `src/App.tsx:1534` keeps the panel rail horizontally scrollable.
  - `src/App.tsx:1546` enables HTML drag behavior on each panel wrapper.
  - `src/App.tsx:705` reorders session panels by moving the dragged panel instance within the active rail state.
- Gaps:
  - None.

### AC11
- Status: PASS
- Proof:
  - `src/App.tsx:978` renders editor panels from a single `panel.filePath` instead of a shared tab strip.
  - `e2e/usage-recordings.spec.ts:230` plus `.agent/tasks/refactor/raw/test-integration.txt` assert `editor-tabs` no longer exist.
- Gaps:
  - None.

### AC12
- Status: PASS
- Proof:
  - `src/App.tsx:663` and `src/App.tsx:664` detect an already-open editor panel for the requested file and focus it instead of duplicating it.
  - `src/App.tsx:680` creates a new editor panel instance only when that file is not already open.
  - `e2e/usage-recordings.spec.ts:239` plus `.agent/tasks/refactor/raw/test-integration.txt` verify one editor opens per file and opening a second file creates a second editor panel while re-clicking the same file does not create a duplicate.
- Gaps:
  - None.

### AC13
- Status: PASS
- Proof:
  - `src/components/file-tree.tsx:15`, `src/components/file-tree.tsx:20`, and `src/components/file-tree.tsx:28` change directory expansion defaults to collapsed and make toggle state explicit per directory.
  - `e2e/usage-recordings.spec.ts:221` plus `.agent/tasks/refactor/raw/test-integration.txt` verify nested files are hidden until their directories are expanded.
- Gaps:
  - None.

## Commands run
- `npm run typecheck` -> PASS (`.agent/tasks/refactor/raw/test-unit.txt`)
- `npm run build` -> PASS (`.agent/tasks/refactor/raw/build.txt`)
- `npm run test:e2e -- --grep "usage recordings"` -> PASS (`.agent/tasks/refactor/raw/test-integration.txt`)
- `rg -n "Web runtime ready" src server electron e2e .agent/tasks/refactor` -> only spec references remain
- `rg -n "panel-toggle-|Agent pinned|editor-tabs|editor-tab" src e2e/usage-recordings.spec.ts` -> no old strip hooks in production source

## Raw artifacts
- `.agent/tasks/refactor/raw/build.txt`
- `.agent/tasks/refactor/raw/test-unit.txt`
- `.agent/tasks/refactor/raw/test-integration.txt`
- `.agent/tasks/refactor/raw/lint.txt`
- `.agent/tasks/refactor/raw/screenshot-1.png`

## Known gaps
- None.
