# Evidence: panel-keyboard-focus-nav

## Overall status
- PASS

## Acceptance criteria

### AC1
- Status: PASS
- Proof:
  - `src/App.tsx:376` adds panel-content focus routing for browser, editor, files, and terminal panels.
  - `src/App.tsx:1028` keeps `Ctrl+Alt+ArrowLeft` / `Ctrl+Alt+ArrowRight` cycling in visual order and requests inner-content focus on the destination panel.
  - `.agent/tasks/panel-keyboard-focus-nav/raw/test-integration.txt` records a passing Playwright run for keyboard panel routing.

### AC2
- Status: PASS
- Proof:
  - `src/App.tsx:388` targets the browser URL input and first file-tree item.
  - `src/components/editor-panel.tsx:231` registers a Monaco focus target for editor panels.
  - `src/components/terminal-panel.tsx:23` registers an xterm focus target for terminal panels.
  - `src/App.tsx:1162` re-focuses inner panel content when the active panel changes.

### AC3
- Status: PASS
- Proof:
  - `src/components/file-tree.tsx:19` flattens visible tree items and maintains a roving focused item.
  - `src/components/file-tree.tsx:87` implements ArrowUp/ArrowDown/ArrowLeft/ArrowRight/Enter behavior.
  - `src/App.tsx:951` accepts `focusEditor` when opening files, and `src/App.tsx:1466` now forwards that option from the Files panel.
  - `e2e/usage-recordings.spec.ts:344` verifies Enter on a file opens the editor and that focus lands inside Monaco.

### AC4
- Status: PASS
- Proof:
  - `src/App.tsx:924` can require real DOM focus inside a workspace panel.
  - `src/App.tsx:1342` binds `Ctrl+Alt+V` to close only the currently focused workspace panel and request fallback content focus.
  - `e2e/usage-recordings.spec.ts:364` covers both the no-op case outside the workspace and the positive close case from the browser URL input.

### AC5
- Status: PASS
- Proof:
  - `npm run typecheck` passed; raw artifact: `.agent/tasks/panel-keyboard-focus-nav/raw/typecheck.txt`.
  - `npm run build` passed; raw artifact: `.agent/tasks/panel-keyboard-focus-nav/raw/build.txt`.
  - `npm run test:e2e -- --grep "panel keyboard focus routing, file tree keys, and Ctrl\+Alt\+V close work"` passed; raw artifact: `.agent/tasks/panel-keyboard-focus-nav/raw/test-integration.txt`.
  - Existing selectors such as `data-testid="web-url-input"`, `data-testid="editor-active-path"`, `data-testid="file-tree-file"`, and `data-testid="file-tree-directory"` remain in place.

## Changed files
- `src/App.tsx`
- `src/components/file-tree.tsx`
- `src/components/editor-panel.tsx`
- `src/components/terminal-panel.tsx`
- `e2e/usage-recordings.spec.ts`

## Commands for a fresh verifier
- `npm run typecheck`
- `npm run build`
- `npm run test:e2e -- --grep "panel keyboard focus routing, file tree keys, and Ctrl\+Alt\+V close work"`

## Known gaps
- None.
