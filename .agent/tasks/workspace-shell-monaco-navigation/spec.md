# Task Spec: workspace-shell-monaco-navigation

## Metadata
- Task ID: workspace-shell-monaco-navigation
- Created: 2026-03-27T14:09:15+00:00
- Repo root: /home/noartem/Projects/big
- Working directory at init: /home/noartem/Projects/big

## Guidance sources
- AGENTS.md

## Current relevant implementation notes
- `src/App.tsx` currently owns the workspace shell, projects sidebar, session header, browser panel UI, panel rail focus state, and the window-level keyboard shortcut handler.
- Browser navigation state is currently session-global in `App.tsx` (`webDraftUrl`, `webUrl`, `webState`) even though multiple browser panels can be added.
- `src/components/editor-panel.tsx` currently uses CodeMirror; `src/components/terminal-panel.tsx` already reads CSS variables from `document.documentElement`, which is the closest existing pattern for theme-synced embedded surfaces.
- `src/components/browser-panel.tsx` exists, but the active workspace browser panel implementation is the inline browser case in `App.tsx`.

## Original task statement
Implement the requested Big IDE workspace polish: browser panel should show the current URL in the panel title instead of a static Browser label; when the URL input differs from the loaded URL show an inline arrow icon inside the input instead of a text Go action and let Enter navigate; migrate the editor from CodeMirror to Monaco with editor theme synchronized to the global app theme; allow collapsing the projects panel to a compact state; make the top session header more compact on large screens by keeping names and chips on one line where possible; add keyboard shortcuts for cycling sessions with Ctrl+Alt+Up/Down, cycling panels with Ctrl+Alt+Left/Right with wraparound, and creating a panel with a browser-safe shortcut while exposing available shortcuts in button tooltips; prefer using a TanStack shortcut library if it fits.

## Acceptance criteria
- AC1: Browser panel chrome reflects navigation state. The rendered browser panel title shows the currently loaded URL for that browser view instead of a static `Browser` label. Before any meaningful page is loaded, a neutral fallback title is acceptable. The URL field keeps `data-testid="web-url-input"`; when its normalized draft value differs from the loaded URL, an inline trailing navigate control is shown inside the input affordance as an icon button (not a text `Go` button), and pressing Enter in the field/form navigates. Existing browser smoke selectors remain available: `web-url-input`, `web-open-button`, `web-iframe`, and `web-status`.
- AC2: Editor panels use Monaco instead of CodeMirror without regressing the current file-open/edit/save flow. Opening files from the Files panel still opens/focuses editor panels, editing updates the in-memory buffer, and `Ctrl/Cmd+S` still saves the active editor file. Current extension-to-language coverage remains at least as good as the existing editor for the currently handled file types.
- AC3: Monaco theme follows the app-wide theme system rather than introducing an editor-only theme toggle. Monaco colors/appearance derive from the same root theme tokens/CSS variables used by the workspace shell so the editor remains visually aligned with the app and updates when the global theme changes.
- AC4: The projects sidebar can be collapsed to a materially narrower compact state and expanded again via an explicit affordance. Compact mode preserves awareness of the active workspace and does not lose the current active project/session selection; on medium-and-up layouts the session workspace reclaims the freed width.
- AC5: The active session header/top bar is denser on large screens. When there is enough horizontal space, the session name and status chips fit on one line, action buttons remain accessible in the same compact header region, and overall header height is reduced relative to the current layout without breaking smaller-screen wrapping behavior. Existing key controls/test ids remain present, including `active-session-label`, `start-session-button`, `stop-session-button`, and `new-panel-button`.
- AC6: `Ctrl+Alt+Up` and `Ctrl+Alt+Down` cycle to the previous/next session across the workspace, not just within the current project. Ordering follows the visible project list and each project's existing session order; empty projects are skipped; crossing a project boundary continues into the adjacent project's session list; and the overall list wraps from first-to-last and last-to-first. Active project and active session update together.
- AC7: `Ctrl+Alt+Left` and `Ctrl+Alt+Right` cycle focused/selected panels within the active session's panel rail in visual order with wraparound. The newly focused panel receives the existing focused styling/selection state and is scrolled into view if needed. With zero or one open panel, the shortcut is a no-op.
- AC8: A browser-safe shortcut opens the Add Panel flow in both Electron and browser mode. For this spec, the required shortcut is `Ctrl+Alt+N`. Shortcut hints are surfaced in hover text/tooltips where there is already an obvious hover affordance or button surface, at minimum on the New Panel control and any newly icon-only browser navigate control. A TanStack shortcut library may be adopted only if it satisfies these behaviors without broad architectural churn.

## Constraints
- Preserve the original workspace shell architecture unless a smaller, localized refactor is required; keep `window.bigIDE` integration points and current project/session/panel model intact.
- Preserve existing high-value UI selectors used by current flows/tests unless implementation explicitly updates the affected tests in the same change, especially `web-url-input`, `web-open-button`, `web-iframe`, `web-status`, `new-panel-button`, `active-session-label`, `session-row`, `start-session-button`, and `stop-session-button`.
- Keep the solution working in both Electron and standalone browser/web-backend mode.
- Source Monaco theming from the existing app theme token/CSS-variable system; do not add a separate editor theme configuration UX.
- Keep shortcut infrastructure changes low-risk. TanStack shortcut adoption is optional, not mandatory, and should be rejected if it requires a broad rewrite or meaningfully increases implementation risk.

## Non-goals
- Creating a new global theme system or adding a theme switcher.
- Delivering Monaco-only advanced IDE features beyond editor replacement/theme parity needed for current workflows.
- Adding user-configurable shortcut settings or a full shortcut cheat-sheet surface.
- Turning the browser panel into a full tabbed browser/history manager or requiring persistent per-panel browser state.
- Persisting sidebar compact/collapsed state across app restarts.

## Assumptions and narrow ambiguity resolution
- The currently rendered browser panel is the `App.tsx` implementation; builders may reuse or remove `src/components/browser-panel.tsx`, but this spec is frozen against the active workspace shell behavior.
- Browser panels may continue sharing the current session-level browser URL/draft/status state unless independent per-panel state falls out naturally with low risk; independent browser state per panel is not required by this task.
- If the loaded browser URL is effectively blank (`about:blank`/initial state), the panel title may fall back to a neutral placeholder rather than displaying an empty string.
- `Ctrl+Alt+N` is the required browser-safe Add Panel shortcut. Additional platform aliases are optional, not required.
- Global shortcuts are only expected to work where Electron/the browser actually dispatches the key event to the app; host OS/browser-reserved combos outside the app's control are out of scope.
- Session cycling order follows the current `projects` array order and each project's existing `sessions` order.

## Open risks
- Monaco has its own keybinding system, so workspace shortcuts may need explicit coordination to keep `Ctrl/Cmd+S` and the new `Ctrl+Alt+...` shortcuts working from editor focus.
- Existing Playwright coverage clicks `web-open-button`; implementation should preserve a clickable navigate control/test id even though the visual treatment changes from text button to inline icon.

## Verification plan
- Automated:
  - `npm run typecheck`
  - `npm run build`
  - `npm run test:e2e -- --grep "usage recordings|workspace panel polish"` if selectors or keyboard flows are updated
- Manual:
  - Add/open a browser panel, confirm the title reflects the loaded URL, the inline navigate icon appears only when the draft differs from the loaded URL, Enter navigates, and the iframe/status selectors still work.
  - Open a file from Files, confirm Monaco renders in the editor panel, editing changes the buffer, save still works via button and `Ctrl/Cmd+S`, and Monaco styling/theme matches the surrounding app shell.
  - Collapse and expand the projects sidebar, verify the workspace area grows/shrinks accordingly, and confirm active project/session context is retained.
  - At a large desktop viewport, verify the session header is visibly slimmer and keeps name/chips on one line where space allows.
  - Validate `Ctrl+Alt+Up/Down` session cycling across project boundaries with wraparound, `Ctrl+Alt+Left/Right` panel cycling with wraparound/scroll-into-view, and `Ctrl+Alt+N` opening the Add Panel flow in browser mode.
