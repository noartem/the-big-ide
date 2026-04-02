# Task Spec: session-layout-editor-fixes

## Metadata
- Task ID: session-layout-editor-fixes
- Created: 2026-03-27T15:56:26+00:00
- Repo root: /home/noartem/Projects/big
- Working directory at init: /home/noartem/Projects/big

## Guidance sources
- AGENTS.md
- src/App.tsx
- src/components/editor-panel.tsx
- src/components/ui/panel-shell.tsx
- src/types/big-ide.ts
- src/lib/web-big-ide-api.ts
- electron/main.js
- server/web-backend.js

## Original task statement
Создай новую задачу по моим замечаниям, и сразу запускай луп по работе над задачей

1. Чипы у сессии без переносов с "..." если не влезает и title на ховер
2. Кнопки start/stop/newpanel строго в одну строчку
3. Кнопки start/stop в том же стиле что и newpanel
4. Убери "Session:" перед названием сессии
5. Добавь возможность менять название сессии, это будет инпут, который выглядит как простой текст, но его можно менять
6. Шорткат ctrl+alt+t на создание новой панели, фокус на первый вариант, стрелочки/таб для выбора, энтер на создание, ескейп чтобы закрыть
7. Эдитор не работает, вообще не видно содержимое
8. Строку бразуера сделать перенести вместо названия панели "Browser"

## Acceptance criteria
- AC1: The active session header no longer renders the `Session:` prefix. `data-testid="active-session-label"` remains present and displays only the current session name.
- AC2: The active session name is editable inline in the session header via an input styled to read like plain text by default. Editing a non-empty trimmed name and confirming it updates the active header label, the session entry in the sidebar, and persisted session state in both Electron and web mode without changing the session id or workdir path. Blank-only renames are rejected by keeping the previous name.
- AC3: The session metadata chips shown next to the active session name remain on a single visual row, truncate with ellipsis instead of wrapping when space is limited, and expose the full chip text through a hover title.
- AC4: The session action buttons for Start, Stop, and `[+ New Panel]` remain on exactly one row without wrapping. If horizontal space is insufficient, the row may scroll horizontally, but the buttons must not break onto multiple lines.
- AC5: The Start and Stop buttons use the same visual treatment as `[+ New Panel]` for variant, sizing, border shape, and typography, while preserving their existing icons, labels, disabled behavior, and `data-testid` hooks.
- AC6: Pressing `Ctrl+Alt+T` opens the add-panel dialog for the active session. When the dialog opens, keyboard focus lands on the first panel option. Users can move focus through panel options with arrow keys and Tab/Shift+Tab, press Enter/Space on the focused option to create that panel, and press Escape to close the dialog without adding a panel.
- AC7: Existing panel-add UI remains usable: `data-testid="new-panel-button"` and `data-testid="new-panel-option-<kind>"` stay available, and clicking an option still adds the corresponding panel to the active session.
- AC8: Opening a file from the Files panel shows the editor content in the Editor panel instead of a blank/invisible editor surface. Existing file contents are visible, edits remain possible, and save behavior continues to work.
- AC9: The Browser panel moves its URL/address row into the panel header area in place of the separate title treatment, so the panel does not show a redundant `Browser` title above the address input. Existing browser navigation behavior, open button behavior, iframe rendering, and `web-*` test ids remain functional.

## Constraints
- Keep the original task statement authoritative; only narrow ambiguities needed for implementation.
- Do not rename session ids, session workdir directories, or sandbox/container resources when a session display name changes.
- Preserve existing `data-testid` hooks already used by Playwright unless a test update is explicitly required by this task.
- Keep `window.bigIDE` as the source of truth for session mutations; if renaming requires a new API surface, implement it consistently for Electron and web backends.
- Use existing UI primitives and design tokens where possible; avoid unrelated visual redesigns.
- Do not regress existing session start/stop, panel creation, browser preview, file open, or file save flows.

## Non-goals
- Redesigning the broader projects sidebar or panel rail beyond the task-specific layout fixes.
- Changing session creation defaults, session ordering, or project/sandbox behavior unrelated to rename support.
- Renaming filesystem folders to match the edited session name.
- Replacing Monaco, changing editor feature scope, or adding new browser capabilities beyond the header/address-row move.
- Introducing additional global shortcuts beyond the requested panel shortcut unless needed for backward compatibility.

## Assumptions
- `Ctrl+Alt+T` is a required add-panel shortcut; the existing `Ctrl+Alt+N` shortcut may remain as a compatibility alias but is not required to be removed.
- The inline session-name editor is always rendered as the active-session label control rather than opening a separate rename dialog.
- Session rename confirmation can happen on blur and Enter; Escape may cancel in-progress edits if the implementation provides it.
- The “chips” mentioned in the task refer to the active session header badges/chips, not a broader redesign of every badge in the app.
- “Browser line” refers to the browser address/input row currently rendered under the Browser panel header.

## Verification plan
- Typecheck/build: Run `npm run typecheck` and `npm run build`.
- Targeted UI coverage: Add or update Playwright coverage for active-session label text, inline session rename, add-panel keyboard flow via `Ctrl+Alt+T`, and visible editor contents after opening a file.
- Manual checks: In a real workspace session, verify header-chip truncation/title behavior, single-row action buttons, browser address row placement, and that renaming persists after reload in both Electron and web mode if both runtimes are exercised.
