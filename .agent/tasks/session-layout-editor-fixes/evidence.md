# Evidence Bundle: session-layout-editor-fixes

## Summary
- Overall status: PASS
- Last updated: 2026-03-27T21:44:33+05:00
- Repo revision inspected: `30dfa2db45935de273874be5be8ec71e76bead4a`

## Acceptance criteria evidence

### AC1 — PASS
- Proof:
  - `src/App.tsx:1860-1882` renders `data-testid="active-session-label"` as an inline text input bound to `sessionNameDraft`; no `Session:` prefix remains.
  - `e2e/usage-recordings.spec.ts:26-32` and `e2e/workspace-panel-polish.spec.ts:21-27` assert the control value equals the bare session name.
  - `.agent/tasks/session-layout-editor-fixes/raw/test-integration.txt` shows the updated Playwright suite passed.
- Gaps: none.

### AC2 — PASS
- Proof:
  - `src/App.tsx:574-599` trims rename input, rejects blank-only renames, calls `window.bigIDE.sessions.rename(...)`, and syncs the updated session into local state.
  - `src/App.tsx:1860-1882` keeps the active-session control inline and plain-text styled.
  - `src/lib/web-big-ide-api.ts:152-172` + `server/web-backend.js:1259-1270` implement persisted rename for web mode.
  - `electron/preload.mjs:26-45` + `electron/main.js:1267-1278` implement the same persisted rename path for Electron.
  - `e2e/usage-recordings.spec.ts:207-253` verifies the row update, persistence via `runtime.projects.list()`, unchanged `id`/`workdir`, and blank-only rejection.
- Gaps: none.

### AC3 — PASS
- Proof:
  - `src/App.tsx:1884-1905` renders the chips in one `flex ... overflow-hidden whitespace-nowrap` row.
  - Each chip has a hover `title`, capped width (`max-w[...] min-w-0`), and inner `span.truncate` for ellipsis behavior.
- Gaps: none.

### AC4 — PASS
- Proof:
  - `src/App.tsx:1909-1944` renders the action row as `flex ... overflow-x-auto whitespace-nowrap`.
  - Each action button has `shrink-0`, so the controls stay on one row and can scroll horizontally instead of wrapping.
- Gaps: none.

### AC5 — PASS
- Proof:
  - `src/App.tsx:1910-1944` gives Start, Stop, and New Panel the same `size="sm"`, `variant="outline"`, `rounded-none`, and `px-3` treatment.
  - The same block preserves icons, labels, disabled behavior, and the original test ids.
- Gaps: none.

### AC6 — PASS
- Proof:
  - `src/App.tsx:1205-1208` binds `Ctrl+Alt+T` to `openPanelDialog()`.
  - `src/App.tsx:2121-2126` focuses the first panel option on dialog open.
  - `src/App.tsx:817-850` handles arrow/Home/End navigation between options.
  - `src/App.tsx:2133-2144` renders native button options in DOM order, preserving Tab/Shift+Tab plus Enter/Space button semantics; Escape is handled by the Radix dialog wrapper.
  - `e2e/usage-recordings.spec.ts:255-266` verifies focus, arrow navigation, Enter creation, and Escape close.
- Gaps: none.

### AC7 — PASS
- Proof:
  - `src/App.tsx:1934-1944` keeps `data-testid="new-panel-button"`.
  - `src/App.tsx:2133-2144` keeps `data-testid="new-panel-option-<kind>"` and the click-to-add handler.
  - `e2e/usage-recordings.spec.ts:34-36`, `255-261`, and `387-395` continue to use the panel-add flow successfully.
- Gaps: none.

### AC8 — PASS
- Proof:
  - `src/components/ui/panel-shell.tsx:21-41` keeps panel content in a `flex min-h-0 flex-1 flex-col overflow-hidden` container.
  - `src/App.tsx:1356-1360` wraps `EditorPanel` in `flex h-full min-h-0 flex-1 flex-col overflow-hidden`, restoring visible editor height.
  - `src/components/editor-panel.tsx:236-334` still creates Monaco, binds the file model, propagates edits, and wires save callbacks.
  - `e2e/usage-recordings.spec.ts:322-331` opens `README.md` and asserts visible editor content (`Playwright fixture`).
- Gaps: none.

### AC9 — PASS
- Proof:
  - `src/components/ui/panel-shell.tsx:22-30` suppresses the standard title block when `headerContent` is supplied.
  - `src/App.tsx:1521-1549` moves the browser address form into `PanelShell.headerContent`.
  - `src/App.tsx:1527-1547` and `1558-1569` preserve `web-url-input`, `web-open-button`, `web-status`, and iframe behavior.
  - `e2e/usage-recordings.spec.ts:387-395` verifies the browser panel still navigates and loads successfully.
- Gaps: none.

## Commands run / relied on
- `npm run typecheck`
- `npm run build`
- `npm run test:e2e -- --grep "session rename and Ctrl\+Alt\+T panel shortcut work|files open one-editor-per-file and git/browser panels stay usable|panel drag reorder still works after resize and horizontal scroll"`

## Raw artifacts
- `.agent/tasks/session-layout-editor-fixes/raw/test-unit.txt`
- `.agent/tasks/session-layout-editor-fixes/raw/build.txt`
- `.agent/tasks/session-layout-editor-fixes/raw/test-integration.txt`
- `.agent/tasks/session-layout-editor-fixes/raw/lint.txt`

## Known gaps
- No dedicated `lint` or unit-test npm script exists in `package.json:7-21`; this does not block any acceptance criterion.
