# Task Spec: refactor

## Metadata
- Task ID: refactor
- Created: 2026-03-26T06:30:21+00:00
- Repo root: /home/noartem/Projects/big
- Working directory at init: /home/noartem/Projects/big

## Guidance sources
- AGENTS.md
- tasks/refactor.md
- src/App.tsx
- src/components/file-tree.tsx
- src/components/agent-panel.tsx
- src/components/ui/panel-shell.tsx
- src/types/big-ide.ts
- server/web-backend.js
- electron/main.js

## Original task statement
- [ ] Убери "Projects\nWorkspace\nweb mode", оставь там просто название проекта
- [ ] Перенеси создание сессии в виде кнопки в итеме проекта
- [ ] Перенеси создание проекта в небольшую кнопку "[+ New Project]", которая
  открывает модалку создания
- [ ] Убери какие-то непонятные проекты, которые я вижу при старте. При новом
  старте должно быть пусто
- [ ] Убери "Web runtime ready"
- [ ] Убери пэдинг у main > section
- [ ] Убери лищние бордеры и дивайды, сейчас они в некоторых местах накладываются и это некрасиво
- [ ] Чипы сессии сделай компактнее и под названием
- [ ] Кнопки Start/Stop сделай компактнее
- [ ] Добавь скролл между панелями
- [ ] Дай возможность закрыть панель агента
- [ ] Может быть несколько панелей одного типа, замени текущее создание на
  модалку по клику на кнопку "[+ New Panel]"
- [ ] Панели можно перетаскивать
- [ ] У Editor не будет табов, одна панель - один файл. При открытии файла из
  Files создавай новую панель
- [ ] Баг: нельзя свернуть папку в Files. По-умолчанию все папки пусть будут
  свернуты
- [ ] Если есть панель с Editor файлом, не создавай новый, а фокус туда
- [ ] Убери навигацию "Panel [Agent pinned] [Files] [Editor] ..." - она больше
  не нужна

## Acceptance criteria
- AC1: The left sidebar header no longer shows the stacked "Projects", "Workspace", or runtime-mode labels. When an active project exists, that header area shows the active project's name as the primary label; when no project exists, a neutral empty-state header is acceptable.
- AC2: Project creation moves out of the always-visible form into a compact `[+ New Project]` button that opens a creation modal. Submitting that modal still creates the project through the existing `window.bigIDE.projects.create` flow.
- AC3: Session creation moves out of the global sidebar form into a control inside each project item. Creating a session from a project item creates the session for that specific project and keeps the existing session lifecycle actions functional.
- AC4: A fresh app state with no persisted projects shows an empty project list with no auto-seeded/demo/placeholder projects. The refactor must not introduce startup seeding in either Electron or web mode.
- AC5: The literal "Web runtime ready" is removed from the UI. Startup and status messaging may remain, but must use neutral wording that works in both runtime targets.
- AC6: The main workspace content removes the extra `main > section` padding, and overlapping/redundant borders or dividers are cleaned up so adjacent shells do not visually double-stack separators.
- AC7: In the active session header, session chips/badges are presented in a more compact form beneath the session title instead of sharing the same crowded title row, and the Start/Stop controls use a visibly more compact treatment while preserving their current actions.
- AC8: The existing panel toggle/navigation strip (`Panels`, `Agent pinned`, `Files`, `Editor`, etc.) is removed. In its place, the session workspace provides a `[+ New Panel]` entry point that opens a modal for creating additional panels.
- AC9: The panel creation flow supports multiple panels of the same type in one session layout, and any panel instance - including an agent panel - can be closed individually.
- AC10: Session panels can be reordered by drag and drop within the horizontal panel rail, and the rail remains horizontally scrollable so off-screen panels are still reachable.
- AC11: Editor panels no longer use tabs. One editor panel represents one file.
- AC12: Opening a file from the Files panel creates a new editor panel for that file unless that same file is already open in an existing editor panel; in that case, the app focuses the existing panel instead of creating a duplicate for the same file.
- AC13: The Files panel supports collapsing directories correctly, and directories are collapsed by default when the tree first loads.

## Constraints
- Do not change production code during spec freeze.
- Preserve the original task statement verbatim.
- Preserve existing `window.bigIDE` bootstrap, project, session, filesystem, terminal, agent, browser, and git integration contracts unless implementation later proves a minimal extension is unavoidable.
- Preserve existing `data-testid` hooks that current UI flows depend on unless an implementation task explicitly includes coordinated test updates.
- Keep the refactor compatible with both Electron and web runtime targets.
- Prefer existing UI primitives in `src/components/ui/` and existing app layout patterns over introducing a parallel UI system.

## Non-goals
- Redesigning backend persistence, session runtime, git behavior, browser behavior, or agent runtime behavior beyond what is required to support the UI refactor.
- Deleting or migrating a user's already-persisted local projects/sessions as part of this task.
- Implementing panel docking, resizing, split-pane persistence, or other window-manager behavior beyond horizontal multi-panel creation, closing, scrolling, and reordering.
- Adding editor tab UX back in any form.

## Verification plan
- Build: run `npm run build` after implementation.
- Unit tests: run `npm run typecheck` after implementation.
- Integration tests: run targeted UI coverage for panel/session flows if selectors or interactions change.
- Lint: run any repo-standard lint step if added to the implementation path.
- Manual checks: verify empty startup state; create project via `[+ New Project]` modal; create session from a project item; confirm header copy cleanup; confirm compact session header/actions; add duplicate panels via `[+ New Panel]`; close an agent panel and reopen it; drag-reorder panels; confirm horizontal scrolling; open files repeatedly to create/focus editor panels; verify folders start collapsed and can toggle open/closed.

## Assumptions
- "Just the project name" refers to the active project's `Project.name`; when no project is selected yet, a neutral empty-state header is acceptable.
- "Should be empty on new start" refers to a clean/fresh persisted state. This task does not require clearing existing user-created local state automatically.
- `[+ New Panel]` replaces the current panel-toggle strip. It must provide a way to add panel types that can be reopened after closing, including Agent; editor panels are still primarily created by opening files from Files.
- Dragging panels means reordering them within the current session's horizontal rail only; no docking/resizing behavior is implied.
