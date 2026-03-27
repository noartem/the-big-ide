# Task Spec: workspace-panel-polish

## Metadata
- Task ID: workspace-panel-polish
- Status: Frozen
- Created: 2026-03-27T10:18:19+00:00
- Repo root: /home/noartem/Projects/big
- Working directory at init: /home/noartem/Projects/big

## Guidance sources
- AGENTS.md
- `src/App.tsx`
- `src/components/ui/panel-shell.tsx`
- `src/components/terminal-panel.tsx`
- `e2e/usage-recordings.spec.ts`

## Original task statement
Refine the Big IDE workspace UI based on user feedback: simplify the left sidebar so it only shows the project title, new project button, and the project/session list; simplify session cards and active session header so only the session name, control buttons, project chip, and current status chips remain; remove extra chips and runtime/workspace metadata; make workspace panel containers fill available height without causing page-level vertical scrolling, with scrolling contained inside each panel and horizontal scrolling only for the panel rail; fix file-open behavior so selecting a file scrolls directly to the newly opened editor panel instead of first scrolling to the file tree panel; simplify the Files panel header by removing redundant workspace path; simplify the Editor panel by keeping title, file path, and controls, removing the duplicate bottom status/path strip, and keeping scrolling only inside the editor; ensure the Terminal panel fills height, has a solid theme-aware background, and verify terminal startup behavior; simplify the Browser panel so the main header row is the URL input, enter navigates, a go button only appears when the draft URL differs from the loaded URL, and remove redundant subtitle/help/status rows; add panel width resizing so different panels can be narrower or wider as needed while preserving existing key test ids and flows where possible.

## Acceptance criteria
- AC1: The left sidebar is reduced to the app title, the existing `new-project-button`, and the project/session navigation area; extra footer/status chrome outside that navigation area is removed.
- AC2: Project rows remain usable for expand/collapse and session creation, but extra metadata chrome is removed; session rows remain selectable via `session-row` and present a simplified session summary centered on the session name and current status.
- AC3: The active session header keeps `active-session-label`, the Start/Stop/New Panel controls, one project chip, and the current session/agent status chips; runtime/workspace text, agent URL text, sandbox chip, and docker availability chip are removed.
- AC4: With an active session open, the workspace layout fills available height without page-level vertical scrolling at normal desktop sizes; vertical scrolling is contained inside the sidebar or panel content areas, and horizontal scrolling is limited to the session panel rail.
- AC5: The Files panel header no longer repeats the workspace path, and opening a file from the file tree opens or focuses the matching editor panel, then scrolls the panel rail so that editor panel is brought into view directly; reopening the same file does not create a duplicate editor panel.
- AC6: The Editor panel keeps the file title, relative file path, and existing save/close controls in the main header, removes the duplicate path/status strip, keeps editor scrolling inside the editor body, and preserves `editor-active-path` on the visible path element used by the editor-open E2E flow.
- AC7: The Terminal panel fills the full panel body height, uses a solid theme-aware background, and still starts, resizes, accepts input, and stops against the current session through the existing terminal integration.
- AC8: The Browser panel is simplified so navigation is driven from the top URL row, Enter submits navigation, the existing `web-open-button` submit affordance appears only when the normalized draft URL differs from the loaded URL, redundant subtitle/help/status rows are removed, and the empty state or iframe fills the remaining body area.
- AC9: Open panels can be resized narrower or wider from the panel rail without breaking focus, drag-reorder, close, file-open, or browser/terminal flows during the current app session.

## Constraints
- Do not modify production code during spec freeze; only this spec file is updated in this phase.
- Preserve the original task statement verbatim.
- Preserve existing key `data-testid` selectors and user flows where the underlying control still exists, especially `workspace-app-title`, `new-project-button`, `new-session-button`, `session-row`, `active-session-label`, `new-panel-button`, `session-panel-area`, `session-panel-scroll-region`, `session-panel-rail`, `session-panel`, `file-tree-file`, `editor-active-path`, `web-url-input`, `web-open-button`, `web-iframe`, and the current git action selectors.
- Keep project/session management, panel creation, editor opening, browser loading, and terminal startup working in both Electron and web runtime modes.
- Keep changes focused on workspace panel UI/state behavior; avoid backend contract or storage model changes unless UI wiring strictly requires them.
- Prefer client-side state for focus, scrolling, and panel-width behavior.

## Non-goals
- Redesigning the Agent or Git panels beyond any layout adjustments needed to fit the new full-height/contained-scroll behavior.
- Persisting panel widths across app reloads, across different sessions, or to backend storage.
- Changing sandbox/runtime/docker behavior, session lifecycle semantics, or `window.bigIDE` API contracts.
- Adding browser history, bookmarks, tabs, or additional browser controls beyond the simplified URL submission behavior.
- Introducing editor tabs, changing file-tree data loading semantics, or expanding the task into a broader visual redesign outside the requested workspace polish.
- Writing `evidence.md`, `evidence.json`, `verdict.json`, or `problems.md` during spec freeze.

## Assumptions
- "Current status chips" means the active header keeps the session run-state chip and OpenCode/agent-status chip; sandbox, docker, runtime-target, workspace-path, and agent-URL metadata are removed.
- The existing `new-session-button` remains in each project row because it is part of the project/session list workflow and is used by current E2E coverage.
- Panel resizing is required for desktop/pointer-driven panel rail usage; mobile layouts may continue using the default responsive widths without a dedicated resize interaction.
- Panel width changes only need to persist in memory for the currently open app session.
- When a simplified UI removes an old wrapper element, the replacement visible control should keep the existing selector (`editor-active-path`, `web-open-button`) when practical so current flows remain testable.

## Verification plan
- Build: run `npm run build`.
- Unit tests: no dedicated unit-test coverage is expected for this polish; rely on targeted behavior checks and E2E coverage.
- Integration tests: run `npm run test:e2e -- e2e/usage-recordings.spec.ts` or the closest targeted Playwright subset that covers session selection, file open, editor focus, git, and browser flows.
- Lint: no standalone lint script is currently defined in `package.json`.
- Manual checks: verify sidebar/header simplification, absence of page-level vertical scrolling, contained panel scrolling, file-open scrolling to the editor panel, editor header/path behavior, terminal startup/background/resize behavior, browser Enter-plus-conditional-go behavior, and panel-width resizing alongside drag-reorder.
