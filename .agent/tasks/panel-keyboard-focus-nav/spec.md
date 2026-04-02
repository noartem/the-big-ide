# Task Spec: panel-keyboard-focus-nav

## Metadata
- Task ID: panel-keyboard-focus-nav
- Created: 2026-03-28T06:56:13+00:00
- Repo root: /home/noartem/Projects/big
- Working directory at init: /home/noartem/Projects/big

## Guidance sources
- AGENTS.md
- Existing task stub in this file
- `src/App.tsx` panel cycling, shortcut handling, and panel rendering
- `src/components/file-tree.tsx` file tree interaction model
- `src/components/browser-panel.tsx` browser URL input
- `src/components/editor-panel.tsx` Monaco editor mount
- `src/components/terminal-panel.tsx` xterm mount

## Original task statement
При перемещении через Ctrl-Alt влево-вправо нужно делать фокусы в содержимое панели. То есть если это браузер, то в URL-бар. Если это эдитор, то фокус в сам редактор. Если это файл, то фокус на первый файл. Ну, и что потом уже можно было перемещаться. Также в файл нужно добавить перемещение по стрелочкам, просто стрелочкам Enter. Закрыть раскрыть папку. Enter на файл, переходит в редактор. Когда переход в терминал, то надо фокусить сам терминал. Шорткат контрол альтв для закрытия панели.

## Acceptance criteria
- AC1: `Ctrl+Alt+ArrowLeft` and `Ctrl+Alt+ArrowRight` continue to move the active-panel selection across the open panels of the active session in visual order, and when the destination panel is one of the panels named in the task, keyboard focus is moved into that panel's primary content instead of remaining on the outer panel shell.
- AC2: Primary-content focus targets are explicit and immediately usable after panel cycling: Browser focuses the URL input, Editor focuses the Monaco editor surface, Terminal focuses the xterm terminal surface, and Files focuses the first keyboard-navigable item in the rendered file tree so the user can continue navigating without an extra click.
- AC3: While the Files panel has focus, keyboard-only tree navigation works with plain arrow keys and Enter: Up/Down move between visible tree items, Right opens a collapsed folder, Left closes an expanded folder, Enter on a folder toggles it, and Enter on a file opens or reuses that file's editor panel and moves focus into the editor content.
- AC4: A panel-close shortcut is available on the active session workspace and closes the currently focused panel without using the mouse; after closing, focus falls through using the existing panel-close selection behavior (next panel if available, otherwise previous, otherwise none).
- AC5: Existing panel-management behavior is preserved unless directly required for the task: `Ctrl+Alt+T` still opens the new-panel dialog, panel cycling still works for the active session, existing panel/file-tree test selectors remain available, and the change does not require backend/runtime changes outside the current React UI path.

## Constraints
- Do not change production behavior outside panel keyboard focus routing, file-tree keyboard navigation, and the requested panel-close shortcut.
- Preserve current panel ordering, panel add/remove flows, and existing `data-testid` hooks used by the repository's Playwright coverage.
- Keep the solution in the existing frontend code paths (`src/App.tsx` and current panel components); no backend, Docker, or release-flow changes are in scope.
- The same UI behavior must work in the shared React application used by both Electron mode and web mode.

## Non-goals
- Redesigning panel layout, drag/reorder behavior, resize behavior, or the project/session sidebar.
- Adding new panel kinds or changing how Agent/Git panels work beyond not regressing existing behavior.
- Defining full ARIA treeview parity, typeahead, Home/End navigation, or browser-iframe content focus behavior beyond the URL bar requirement.
- Changing session-cycling shortcuts (`Ctrl+Alt+ArrowUp` / `Ctrl+Alt+ArrowDown`) or the existing new-panel shortcut.

## Assumptions / ambiguity resolution
- The requested close shortcut text (`контрол альтв`) is interpreted narrowly as `Ctrl+Alt+V`; verifier should confirm that this is the intended key combination and not a layout-specific variant.
- "If it is files, focus the first file" is implemented as focusing the first keyboard-navigable visible tree item in the Files panel, because the rendered tree may begin with directories and the immediate goal is arrow/Enter navigation without a mouse.
- The close shortcut applies to the currently focused panel in the active session workspace, not to the entire panel rail, the sidebar, or the new-panel dialog.
- The task explicitly names Browser, Editor, Files, and Terminal focus targets; Agent and Git panels are expected to keep working, but this spec does not require new dedicated inner-focus targets for them.

## Verification plan
- Build: `npm run build`
- Integration tests: run focused Playwright coverage for panel shortcuts and panel usability, plus a new/updated scenario covering `Ctrl+Alt+ArrowLeft/ArrowRight` content focus handoff, Files tree arrow/Enter behavior, and the panel-close shortcut.
- Manual checks: in an active session with Files, Editor, Browser, and Terminal panels open, verify keyboard-only cycling lands focus on the expected inner target for each panel and that Files navigation can open folders/files without mouse input.
