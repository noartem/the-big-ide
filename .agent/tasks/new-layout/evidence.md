# Evidence Bundle: new-layout

## Summary
- Overall status: PASS
- Refreshed: 2026-03-26
- Validation rerun status: `npm run typecheck` PASS, `npm run build` PASS, `npm run test:e2e -- --grep "usage recordings"` PASS

## Acceptance criteria evidence

### AC1
- Status: PASS
- Proof:
  - The existing project/session navigation remains in the left sidebar, while the selected-session workspace renders in a dedicated adjacent area at `src/App.tsx:1253` and `src/App.tsx:1254`.
  - When no session is selected, the explicit empty state is rendered at `src/App.tsx:1255` and `src/App.tsx:1266`.
  - Playwright verifies the empty state and selected-session workspace rail in `e2e/usage-recordings.spec.ts:92` and `e2e/usage-recordings.spec.ts:95`; rerun passed in `.agent/tasks/new-layout/raw/test-integration.txt`.
- Gaps:
  - None.

### AC2
- Status: PASS
- Proof:
  - The session workspace and panel shell use flat borders and no panel rounding at `src/components/ui/panel-shell.tsx:19` and `src/App.tsx:1254`.
  - Workspace controls and badges explicitly use `rounded-none` across the session area, including the session header and panel controls at `src/App.tsx:1288`, `src/App.tsx:1323`, and `src/App.tsx:1360`.
  - Global radius for the workspace primitives used by editor/terminal surfaces is removed at `src/styles.css:23`, `src/styles.css:64`, and `src/styles.css:68`.
- Gaps:
  - Manual visual review was not repeated in this evidence refresh; verdict is based on current source inspection plus the passing UI flow tests.

### AC3
- Status: PASS
- Proof:
  - Session/runtime/OpenCode/Docker context and start-stop controls are consolidated in the session header at `src/App.tsx:1285`, `src/App.tsx:1297`, `src/App.tsx:1305`, and `src/App.tsx:1321`.
  - The Agent panel body no longer duplicates status/start UI or logs; it only renders chat/fallback states at `src/components/agent-panel.tsx:17` and `src/components/agent-panel.tsx:49`.
  - Playwright exercises the header controls in `e2e/usage-recordings.spec.ts:107` through `e2e/usage-recordings.spec.ts:117`.
- Gaps:
  - None.

### AC4
- Status: PASS
- Proof:
  - The open-panel rail is horizontally scrollable and non-wrapping at `src/App.tsx:1372`.
  - Each panel wrapper is full-height and non-shrinking at `src/App.tsx:1376` through `src/App.tsx:1380`.
  - Internal scrolling is implemented within panels, including Agent (`src/components/agent-panel.tsx:50`), Files (`src/components/file-tree.tsx:88`), Editor tabs/body (`src/App.tsx:801`, `src/App.tsx:847`), Git (`src/App.tsx:919`, `src/App.tsx:940`), and Browser content (`src/App.tsx:1065`).
  - Playwright verifies the rail CSS and horizontal side-by-side panel layout in `e2e/usage-recordings.spec.ts:95`, `e2e/usage-recordings.spec.ts:96`, `e2e/usage-recordings.spec.ts:97`, and `e2e/usage-recordings.spec.ts:208` through `e2e/usage-recordings.spec.ts:216`.
- Gaps:
  - Internal scroll behavior is primarily source-verified rather than exhaustively asserted panel-by-panel in Playwright.

### AC5
- Status: PASS
- Proof:
  - The default open panel list is `agent` only at `src/App.tsx:29`, and session state restores/pins agent in `src/App.tsx:176` and `src/App.tsx:177`.
  - Additional panels are opened only through explicit toggle controls defined at `src/App.tsx:31` and rendered at `src/App.tsx:1345` through `src/App.tsx:1367`.
  - Playwright asserts one open panel by default and no auto-open Git panel at `e2e/usage-recordings.spec.ts:99` through `e2e/usage-recordings.spec.ts:103`.
- Gaps:
  - None.

### AC6
- Status: PASS
- Proof:
  - The Agent panel fronts the existing OpenCode server URL from `activeSession.agentRuntime.port` via `getAgentChatUrl` at `src/App.tsx:187` and an iframe at `src/components/agent-panel.tsx:49` through `src/components/agent-panel.tsx:56`.
  - The backend still starts OpenCode as a server process and returns a port in the current runtime flow at `server/web-backend.js:930` through `server/web-backend.js:1005`; no new frontend/backend chat API was introduced in `src/types/big-ide.ts:103` through `src/types/big-ide.ts:120`.
  - Playwright covers the agent chat surface in `e2e/usage-recordings.spec.ts:103`, `e2e/usage-recordings.spec.ts:121`, and `e2e/usage-recordings.spec.ts:141` through `e2e/usage-recordings.spec.ts:142`.
- Gaps:
  - The embedded chat assumes the OpenCode UI is reachable at the root served URL for the reported port.

### AC7
- Status: PASS
- Proof:
  - File clicks use stable selectors in `src/components/file-tree.tsx:61` through `src/components/file-tree.tsx:71`.
  - `openFile` forces the Editor panel open and activates per-session editor state at `src/App.tsx:264` through `src/App.tsx:285`.
  - Editor tabs are rendered from per-session open file state at `src/App.tsx:801` through `src/App.tsx:827`.
  - Playwright verifies Files -> Editor open/reveal and active tab state at `e2e/usage-recordings.spec.ts:192` through `e2e/usage-recordings.spec.ts:205`.
- Gaps:
  - None.

### AC8
- Status: PASS
- Proof:
  - The visible workspace derives from the selected session via `activeSession` at `src/App.tsx:166` through `src/App.tsx:168`.
  - Editor state is stored per session id at `src/App.tsx:142`, `src/App.tsx:242`, and `src/App.tsx:249`.
  - Session-row clicks update the selected project/session without backend contract changes at `src/App.tsx:1212` through `src/App.tsx:1225`, while the `BigIDEApi` surface remains the same at `src/types/big-ide.ts:103` through `src/types/big-ide.ts:120`.
- Gaps:
  - The evidence refresh did not add a dedicated two-session switching E2E assertion; this verdict is based on current source flow and passing session-selection coverage.

### AC9
- Status: PASS
- Proof:
  - Playwright now covers session lifecycle/default agent-only layout at `e2e/usage-recordings.spec.ts:85` through `e2e/usage-recordings.spec.ts:119`.
  - It covers the Docker-requested startup path and agent chat surface at `e2e/usage-recordings.spec.ts:121` through `e2e/usage-recordings.spec.ts:146`.
  - It covers Files -> Editor tab activation plus additional panels and stable selectors at `e2e/usage-recordings.spec.ts:149` through `e2e/usage-recordings.spec.ts:264`.
  - The focused rerun passed with 3 tests in `.agent/tasks/new-layout/raw/test-integration.txt`; local Docker availability was confirmed in `.agent/tasks/new-layout/raw/docker-info.txt`.
- Gaps:
  - The Docker Playwright test requests docker mode and conditionally asserts the iframe when the runtime reports `sandbox docker`; it does not fail solely on host fallback if the backend degrades to host mode.

## Commands run
- `npm run typecheck` -> PASS (`.agent/tasks/new-layout/raw/test-unit.txt`)
- `npm run build` -> PASS (`.agent/tasks/new-layout/raw/build.txt`)
- `npm run test:e2e -- --grep "usage recordings"` -> PASS (`.agent/tasks/new-layout/raw/test-integration.txt`)
- `docker info` -> PASS (`.agent/tasks/new-layout/raw/docker-info.txt`)

## Raw artifacts
- `.agent/tasks/new-layout/raw/test-unit.txt`
- `.agent/tasks/new-layout/raw/build.txt`
- `.agent/tasks/new-layout/raw/test-integration.txt`
- `.agent/tasks/new-layout/raw/docker-info.txt`
- `.agent/tasks/new-layout/raw/source-review.txt`

## Residual risks
- The Docker-specific Playwright scenario is tolerant of runtime fallback to host mode, so it provides smoke coverage of the docker-backed path request but not a strict guarantee that docker remains active in every environment.
- The brutalist/minimalist styling verdict is source-based in this refresh rather than from a newly captured visual artifact.
