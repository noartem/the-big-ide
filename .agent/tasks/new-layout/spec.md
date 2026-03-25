# Task Spec: new-layout

## Metadata
- Task ID: new-layout
- Created: 2026-03-25T12:22:41+00:00
- Repo root: /home/noartem/Projects/big
- Working directory at init: /home/noartem/Projects/big

## Guidance sources
- AGENTS.md
- tasks/new-layout.md
- src/App.tsx
- src/components/agent-panel.tsx
- src/components/editor-panel.tsx
- src/components/file-tree.tsx
- src/components/ui/panel-shell.tsx
- src/types/big-ide.ts
- server/web-backend.js
- e2e/usage-recordings.spec.ts

## Original task statement
Сейчас У нас есть только список сессий. Нужно для выбранной сессии показывать панели. Панели раньше были не очень, сейчас у меня такая идея: панели как бесконечный список по горизонтали, с высотой по вертикали 100%. По умолчанию открывать только панель чата с агентом, все остальные панели открываются уже пользователем. Используй e2e тестирование для отслеживания итогового результата

## Additional task statement to incorporate
- Переработать дизайн, никаких карточек в карточках, отступов как у карточек, скруглений и т.д. Теперь никаких лишних отступов, никаких скруглений. Только небольшие разделения гэпами, минимум пэдингов и `divide-y`, `border-border`. Тотальный брутализм и минимализм.
- Также к панелям надо добавить скролл.
- Панель агента - это панель чата с кодовым агентом (OpenCode). OpenCode запускается как сервер и к нему нужен chat UI. Информация по статусу/запуску уже должна быть в хэдере сессии - больше не надо.
- Делай через Docker и `sandbox mode enabled`. Если надо, прокидывай `docker.sock` в контейнеры e2e тестов.
- Нажатие на файл в Files открывает ближайшую панель Editor (или новую, если ее нет) с табом этого файла.

## Acceptance criteria
- AC1: The app keeps the existing project/session navigation and, when a session is selected, renders a dedicated session workspace area next to the session list instead of showing only the list. If no session is selected, the workspace area shows an explicit empty state.
- AC2: The selected-session workspace adopts a brutalist/minimalist visual treatment for the session area and its panels: no card-within-card presentation, no rounded corners, no decorative shadows, minimal padding, and separation primarily through `border-border`, `divide-y`, and small gaps.
- AC3: The session header remains the single place for session/runtime status and start-stop controls, including the existing session/OpenCode/Docker context needed to understand launch state; that information is not duplicated inside the Agent panel body.
- AC4: Open session panels render as a single horizontally scrollable, non-wrapping strip, each open panel fills the available session-area height, and each panel provides its own internal scrolling for overflowing content rather than forcing the full page to grow vertically.
- AC5: When a session is first shown in the new layout, only the Agent panel is open by default; other session panels are not auto-opened, and the user can open them on demand through explicit UI controls without displacing the default Agent panel.
- AC6: The Agent panel is a chat UI for the existing OpenCode server for that session, using the already-started server/runtime flow rather than a brand-new backend chat protocol, and the panel no longer renders the current status-card-and-log-console layout as its primary UI.
- AC7: Clicking a file in the Files panel opens that file in the existing Editor panel when one is already open, or opens/creates the standard Editor panel when none is open, and activates a tab for the clicked file in that editor surface.
- AC8: Session selection remains the driver for panel content, file tree context, and agent/editor state, so switching the selected session updates the visible workspace area to the new session without changing backend API contracts or session identity handling.
- AC9: Playwright end-to-end coverage is added or updated to verify the selected-session workspace area, the default agent-only state, horizontal panel scrolling, Docker-backed sandbox startup path where Docker is available, the Agent chat surface, and the Files-to-Editor open-file flow using stable selectors/assertions.

## Constraints
- Preserve the original task statement and limit spec-freeze changes to `.agent/tasks/new-layout/spec.md`.
- Do not change production code during spec freeze.
- Keep the implementation compatible with both Electron and web runtime modes by staying within the existing React frontend, existing backend startup flow, and current `window.bigIDE` API surface.
- Preserve the current project/session selection flow as the entry point for opening a session.
- Reuse the existing OpenCode server startup path already present in the repo; this task does not require inventing a brand-new backend-powered chat protocol.
- Treat the Agent panel as a frontend chat surface for the running OpenCode server, with runtime/start status consolidated into the session header.
- Prefer Docker-backed sandbox mode with sandbox mode enabled as the primary execution and verification path where local Docker is available.
- Treat `docker.sock` forwarding only as conditional e2e infrastructure guidance when tests run inside containers and need host Docker access; it is not mandatory production behavior unless the existing test/container setup requires it.
- Reuse the existing session panel model unless the smallest safe frontend extension is needed to support editor tabs for opened files.
- Use Playwright e2e coverage as the primary automated proof for the delivered layout behavior.

## Non-goals
- Adding a new backend message API for OpenCode chat, replacing the existing server startup flow, or changing the session/project data model.
- Implementing arbitrary multi-column editor placement, drag-and-drop panel reordering, resizable split panes, saved panel presets, or persistent per-session layout restoration unless it already falls out naturally from existing behavior.
- Redesigning unrelated sidebar/project-management UI outside the selected-session workspace area.
- Making host-mode fallback the primary verified path when Docker-backed sandbox mode is available.
- Defining a brand-new panel taxonomy beyond the current session-related panels already represented in the codebase.

## Verification plan
- Build: `npm run build`
- Type checks: `npm run typecheck`
- E2E: `npm run test:e2e` with project sandbox mode forced to `docker` where Docker is available; if the e2e runner itself is containerized and needs host Docker access, provide `docker.sock` to that test environment.
- Playwright assertions: selected session shows the session workspace area, only the Agent panel is open by default, the panel rail scrolls horizontally, panel bodies scroll internally, the Agent panel shows the OpenCode chat surface instead of duplicated status cards/logs, and clicking a file in Files opens or reveals the Editor with the clicked file tab active.
- Manual visual check: confirm the selected-session layout uses flat borders, no rounded corners, minimal padding, small gaps/dividers, and no card-within-card styling.

## Assumptions
- Because the repo already starts OpenCode as a server and exposes its port but does not expose a native message API, the Agent panel requirement is satisfied by embedding or otherwise fronting the existing OpenCode server chat UI inside the Agent panel, not by inventing a new backend chat protocol.
- Because the current frontend still models a single `editor` panel type, "nearest Editor panel" is interpreted narrowly as: use the already-open Editor panel if present; otherwise open/create the standard Editor panel and activate a tab for the clicked file there.
- "Infinite list by horizontal" is interpreted narrowly as a horizontally scrollable rail with no fixed visible panel-count cap; it does not require virtualization or true infinite loading.
- "Add scroll to panels" means the panel rail scrolls horizontally and each panel body can scroll internally when its content overflows; it does not require whole-page scrolling or nested custom scroll systems everywhere.
- "Brutalism and minimalism" applies to the selected-session workspace and its panel surfaces, not to a full product-wide rebrand.
- Docker-backed sandbox mode is the verification path to exercise where Docker is available locally; `docker.sock` forwarding is only a conditional tactic for containerized e2e infrastructure when required.
