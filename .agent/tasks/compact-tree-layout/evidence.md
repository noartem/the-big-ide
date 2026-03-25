# Evidence Bundle: compact-tree-layout

## Summary
- Overall status: PASS
- Last updated: 2026-03-26T00:00:00+00:00

## Acceptance criteria evidence

### AC1
- Status: PASS
- Proof:
  - `src/App.tsx:1494` keeps the workspace section height-constrained with `overflow-hidden`.
  - `src/App.tsx:1601` adds a dedicated `session-panel-scroll-region` with `overflow-auto overscroll-contain`, so the panel block owns overflow.
  - `e2e/usage-recordings.spec.ts:108` asserts the panel scroll region exposes horizontal scrolling via CSS.
  - Fresh command artifacts passed: `.agent/tasks/compact-tree-layout/raw/test-unit.txt`, `.agent/tasks/compact-tree-layout/raw/build.txt`, `.agent/tasks/compact-tree-layout/raw/test-integration.txt`.
- Gaps:
  - No direct Playwright assertion on top-level page scroll position; proof is code inspection plus the dedicated scroll-region test.

### AC2
- Status: PASS
- Proof:
  - `src/App.tsx:140` adds `toRelativePathLabel(...)` for concise project-relative labeling.
  - `src/App.tsx:1000`, `src/App.tsx:1034`, and `src/App.tsx:1057` switch Files and Editor labels from absolute paths to project-relative text.
  - `src/App.tsx:1549` also shortens the session runtime workspace label to a relative `workspace ./` form.
  - `e2e/usage-recordings.spec.ts:232` and `e2e/usage-recordings.spec.ts:241` verify editor path labels stay relative (`README.md`, `src/nested/index.ts`).
- Gaps:
  - Panel header text itself is primarily code-inspected; Playwright covers the focused editor path directly.

### AC3
- Status: PASS
- Proof:
  - `src/components/editor-panel.tsx:57` makes the editor container `flex h-full min-h-0 flex-col overflow-hidden`.
  - `src/components/editor-panel.tsx:58` gives CodeMirror a `min-h-0 flex-1` class so it fills the panel body.
  - `src/styles.css:57` and `src/styles.css:69` ensure the CodeMirror theme/scroller uses full height and internal scrolling.
  - Fresh build and Playwright runs passed from `.agent/tasks/compact-tree-layout/raw/build.txt` and `.agent/tasks/compact-tree-layout/raw/test-integration.txt`.
- Gaps:
  - Editor full-height behavior is proven mainly by code inspection plus successful UI flow coverage.

### AC4
- Status: PASS
- Proof:
  - `src/App.tsx:1362` renders a static top-left header with only `The Big IDE` and the existing new-project button.
  - The prior active-project/root-path header content was removed from the sidebar header block in `src/App.tsx`.
  - `e2e/usage-recordings.spec.ts:15` asserts the visible title is exactly `The Big IDE` on load.
- Gaps:
  - None.

### AC5
- Status: PASS
- Proof:
  - `src/App.tsx:194` introduces `expandedProjects` state to support a compact tree-like sidebar.
  - `src/App.tsx:1389` uses per-project expand/collapse state instead of card-heavy always-open sections.
  - `src/App.tsx:1450` keeps nested session rows under each expanded project item with lighter tree styling.
  - Existing selection/session affordances remain in the compact list structure rather than cards.
- Gaps:
  - Compactness/tree styling is primarily code-inspected; no screenshot artifact was required for this task.

### AC6
- Status: PASS
- Proof:
  - `src/App.tsx:1366` preserves `new-project-button` in the compact header.
  - `src/App.tsx:1430` preserves per-project `new-session-button` in the tree row.
  - `src/App.tsx:1450` preserves `session-row` selection hooks in the nested tree.
  - `e2e/usage-recordings.spec.ts:17`, `e2e/usage-recordings.spec.ts:25`, and `e2e/usage-recordings.spec.ts:129` cover project creation, session creation, and session lifecycle/selection in the new layout.
- Gaps:
  - None.

### AC7
- Status: PASS
- Proof:
  - `src/App.tsx:687`, `src/App.tsx:696`, `src/App.tsx:704`, and `src/App.tsx:718` keep the one-editor-per-file logic and focus an existing editor panel when the file is already open.
  - `e2e/usage-recordings.spec.ts:230` and `e2e/usage-recordings.spec.ts:235` verify reopening the same file does not create a duplicate editor panel.
  - `e2e/usage-recordings.spec.ts:240` verifies a second file opens a second editor panel.
- Gaps:
  - None.

## Commands run
- `npm run typecheck` - PASS
- `npm run build` - PASS
- `npm run test:e2e -- --grep "usage recordings"` - PASS

## Raw artifacts
- `.agent/tasks/compact-tree-layout/raw/build.txt`
- `.agent/tasks/compact-tree-layout/raw/test-unit.txt`
- `.agent/tasks/compact-tree-layout/raw/test-integration.txt`
- `.agent/tasks/compact-tree-layout/raw/lint.txt`
- `.agent/tasks/compact-tree-layout/raw/screenshot-1.png`

## Known gaps
- AC1, AC2, AC3, and AC5 include some code-inspection-based proof for layout/visual behavior rather than full screenshot or DOM-metric automation.
- Lint was not run for this task; `.agent/tasks/compact-tree-layout/raw/lint.txt` records that explicitly.
