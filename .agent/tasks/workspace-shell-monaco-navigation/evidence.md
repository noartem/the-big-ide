# Evidence Bundle: workspace-shell-monaco-navigation

## Summary
- Overall status: PASS
- Generated at: 2026-03-27

## Commands relied on
- `npm run typecheck`
- `npm run build`
- `npm run test:e2e`

## Acceptance criteria

### AC1 — PASS
- Proof:
  - Browser panel title follows loaded URL with a `Browser` fallback: `src/App.tsx:303-305`, `src/App.tsx:1435-1444`.
  - Browser controls preserve required selectors and use an inline icon-only navigate button inside the input row: `src/App.tsx:1447-1489`.
  - Enter still navigates because the URL control is inside `<form onSubmit={openWebView}>`: `src/App.tsx:746-753`, `src/App.tsx:1447-1470`.
  - Browser smoke flow passed in browser-mode Playwright: `e2e/usage-recordings.spec.ts:311-319`; output in `.agent/tasks/workspace-shell-monaco-navigation/raw/test-integration.txt` shows the full suite passed.

### AC2 — PASS
- Proof:
  - Editor implementation is Monaco-based, not CodeMirror: `src/components/editor-panel.tsx:1-18`, `src/components/editor-panel.tsx:121-167`, `package.json:96-97`, `src/lib/yaml.worker.ts:1`.
  - Files panel still opens files into editor panels via `onOpenFile` → `openFile`: `src/App.tsx:1231-1235`, `src/App.tsx:776-817`.
  - Editor buffers still update in memory through `EditorPanel.onChange`: `src/App.tsx:1271-1291`; Monaco model changes call back into app state: `src/components/editor-panel.tsx:286-295`.
  - Save remains wired for both global `Ctrl/Cmd+S` and Monaco-focused `Ctrl/Cmd+S`: `src/App.tsx:1075-1082`, `src/components/editor-panel.tsx:252-254`.
  - Language coverage includes TS/TSX/JS/JSX/JSON/MD/MDX/CSS/SCSS/HTML/YAML/YML: `src/components/editor-panel.tsx:170-207`.
  - Fresh integration proof passed: `e2e/usage-recordings.spec.ts:247-319` exercises file open/editor count/git/browser usability; `.agent/tasks/workspace-shell-monaco-navigation/raw/test-integration.txt` reports `4 passed`.

### AC3 — PASS
- Proof:
  - Monaco theme colors are derived from root app CSS tokens, converted into Monaco-safe colors: `src/components/editor-panel.tsx:24-119`.
  - Root theme tokens come from the shared app theme in `src/styles.css:5-23`.
  - Monaco theme reacts to root theme attribute changes through a `MutationObserver`: `src/components/editor-panel.tsx:258-264`.
  - Monaco shell styling stays aligned with app typography sizing in `src/styles.css:57-71`.

### AC4 — PASS
- Proof:
  - Projects sidebar has an explicit collapse/expand affordance with labels/tooltips: `src/App.tsx:1548-1567`.
  - Compact width is materially narrower on md+ layouts (`20rem` → `5rem` min width): `src/App.tsx:1549-1552`.
  - Compact mode preserves active workspace awareness via compact project cards and footer context without clearing active ids: `src/App.tsx:1596-1623`, `src/App.tsx:1727-1733`.

### AC5 — PASS
- Proof:
  - Session header was compacted with reduced padding and a large-screen single-row layout: `src/App.tsx:1770-1789`.
  - Session name and chips stay on one line where space allows via `lg:flex` and `lg:flex-nowrap`: `src/App.tsx:1771-1786`.
  - Required controls/test ids remain present: `active-session-label` `src/App.tsx:1773-1775`, `start-session-button` `src/App.tsx:1790-1800`, `stop-session-button` `src/App.tsx:1801-1812`, `new-panel-button` `src/App.tsx:1813-1823`.

### AC6 — PASS
- Proof:
  - Workspace-wide session order is flattened from visible `projects` and each project's `sessions`: `src/App.tsx:270-279`.
  - Previous/next session cycling wraps across project boundaries and updates project plus session together: `src/App.tsx:602-625`.
  - Shortcuts are bound to `Ctrl+Alt+Up` / `Ctrl+Alt+Down`: `src/App.tsx:1095-1104`.

### AC7 — PASS
- Proof:
  - Panel cycling uses the active session's panel order, wraps, and no-ops for zero/one panels: `src/App.tsx:844-867`.
  - Shortcuts are bound to `Ctrl+Alt+Left` / `Ctrl+Alt+Right`: `src/App.tsx:1107-1115`.
  - Focused panel styling remains the ring state and the target panel is scrolled into view: `src/App.tsx:427-445`, `src/App.tsx:1891-1896`.
  - Fresh Playwright proof confirms the panel rail still behaves correctly under scroll/reorder pressure: `e2e/workspace-panel-polish.spec.ts:62-115`; pass recorded in `.agent/tasks/workspace-shell-monaco-navigation/raw/test-integration.txt`.

### AC8 — PASS
- Proof:
  - `Ctrl+Alt+N` opens the Add Panel flow through the global capture-phase keydown handler: `src/App.tsx:1119-1122`, `src/App.tsx:1131-1133`.
  - The New Panel button exposes the shortcut hint in hover text/tooltips: `src/App.tsx:1813-1823`, `src/App.tsx:1923-1925`.
  - The inline browser navigate control exposes its tooltip hint with Enter guidance: `src/App.tsx:1457-1465`.
  - Browser-mode compatibility was exercised by Playwright using the web backend + web UI server config: `playwright.config.ts:20-33`; `.agent/tasks/workspace-shell-monaco-navigation/raw/test-integration.txt` shows the suite passed in that mode.

## Raw artifacts
- `.agent/tasks/workspace-shell-monaco-navigation/raw/build.txt`
- `.agent/tasks/workspace-shell-monaco-navigation/raw/test-integration.txt`
- `.agent/tasks/workspace-shell-monaco-navigation/raw/test-unit.txt`
- `.agent/tasks/workspace-shell-monaco-navigation/raw/lint.txt`

## Notes
- No dedicated unit-test or lint scripts exist in `package.json`; these are recorded as unavailable raw artifacts and do not block the acceptance criteria.
- Build passes with a non-blocking Vite chunk-size warning; see `.agent/tasks/workspace-shell-monaco-navigation/raw/build.txt`.
