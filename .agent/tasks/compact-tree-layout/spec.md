# Task Spec: compact-tree-layout

## Metadata
- Task ID: compact-tree-layout
- Created: 2026-03-26T10:20:27+00:00
- Repo root: /home/noartem/Projects/big
- Working directory at init: /home/noartem/Projects/big

## Guidance sources
- AGENTS.md
- tasks/compact-tree-layout.md
- src/App.tsx
- src/components/file-tree.tsx
- src/components/editor-panel.tsx
- e2e/usage-recordings.spec.ts
- src/types/big-ide.ts

## Original task statement
# Compact tree layout follow-up

- Блок с панелями должен скроилться, а не вся страница
- Не надо на всех панелях писать полный путь до папки
  - В панели файла пиши локальный путь внутри проекта
- В панели редактора, редактор дожен быть на всю высоту, и со скроллом
- В левом верхнем углу страницу НЕ НУЖНо показывать текущий проект, там только название "The Big IDE" и кнопка нового проекта, без пути до проекта
- сайдбар проектов и сессий сделай компактным и древовидным, без обилия карточек

## Acceptance criteria
- AC1: Overflow from the session panel area is contained inside the panel block instead of making the overall page/workspace shell scroll. The page layout remains height-constrained, while the panel rail and panel contents use internal scrolling where needed.
- AC2: Panel headers stop showing full workspace or folder paths by default. Files panels show a concise project-relative location label, and other panel headers use short labels instead of repeating the full absolute workdir path.
- AC3: Editor panels use the full available panel height for the editor surface, and the editor area scrolls internally without collapsing into a short viewport.
- AC4: The top-left sidebar header shows only the product title `The Big IDE` and the new-project entry point. It does not show the active project name, filesystem path, or runtime-mode/path text.
- AC5: The project/session sidebar becomes more compact and tree-like: projects render as lightweight rows or branches with nested session rows, reduced card chrome, and clearer hierarchy while preserving selection, session creation, and session lifecycle actions.
- AC6: The compact sidebar layout keeps the existing project/session flows usable: creating a project still uses the existing modal flow, creating a session still happens from the relevant project item, and active project/session selection remains clear.
- AC7: Existing file-opening behavior remains intact after the compact layout changes: opening files from Files still focuses an already-open editor panel for that file, otherwise opens one editor panel per file.

## Constraints
- Do not edit production behavior beyond what is needed for this layout follow-up.
- Preserve the current modal-based project/session/panel creation flows introduced by the previous refactor unless a minimal adjustment is required to satisfy this task.
- Preserve `window.bigIDE` integration points for bootstrap, projects, sessions, filesystem, terminal, agent, browser, and git actions.
- Preserve existing important `data-testid` hooks unless coordinated Playwright test updates are included in the same change.
- Keep the app usable in both Electron and web runtime targets.
- Prefer existing UI primitives, styling tokens, and layout patterns already used in the repo.
- Keep the dense workspace layout resilient with `min-h-0`, internal scroll containers, and safe overflow handling.

## Non-goals
- No backend persistence or runtime-model changes.
- No redesign of panel creation, drag reordering, or multi-panel support beyond the specific compactness and scrolling adjustments requested here.
- No return to the old pre-refactor card-heavy sidebar or global project/session forms.
- No new path-breadcrumb system beyond concise panel labels needed for this task.

## Verification plan
- Build: `npm run build`
- Unit tests: `npm run typecheck`
- Integration tests: `npm run test:e2e -- --grep "usage recordings"` if selectors or compact-tree interactions change
- Lint: run repo-standard lint only if a relevant script or existing workflow requires it during implementation
- Manual checks:
  - confirm page height stays fixed while panel block scrolls internally
  - confirm panel headers no longer show full absolute workspace paths
  - confirm Files panel shows a project-relative path label
  - confirm editor fills the panel and scrolls internally
  - confirm top-left header only shows `The Big IDE` plus the new-project control
  - confirm project/session sidebar reads as a compact tree with nested sessions
  - confirm project creation, session creation, session selection, file opening, and session lifecycle actions still work

## Assumptions
- "Блок с панелями должен скроилться" means the session workspace/panel region should own overflow behavior; the entire page should not become the primary scroll container because of wide or tall panels.
- "Не надо на всех панелях писать полный путь до папки" applies to panel headers and similar labels, not to contexts where a full path is required for actual file operations behind the scenes.
- "В панели файла пиши локальный путь внутри проекта" means a path relative to the project root/workdir, not just the file basename.
- "только название The Big IDE" means the sidebar header should be static branding, regardless of which project is selected.
- "древовидным" refers to a compact hierarchical projects -> sessions presentation, not a full filesystem-style arbitrary-depth tree.
