# WORKFLOW_CONNECTIONS_CLOUDIMPORT_PHASE8_REPORT

Generated: 2026-09-25 · Branch: `v2-release`

## 1. Summary

Phase 8 focused on Workflow Builder UX, Connections runtime fixes, and Google Drive / Cloud Import scope handling. Recipe-based workflow creation was removed; new workflows start with a real draggable **Start** state only. The builder layout was restructured into header / left node palette / canvas / inspector / bottom status bar. Backend browse/import paths now refresh OAuth tokens, detect missing Google Drive scopes, and return structured error codes.

Live OAuth, Cloud Import E2E, workflow manual runs, and browser E2E were **not executed** in this environment (no authenticated runtime + no provider credentials configured for automated live tests).

## 2. Files changed

### Modified
- `backend/src/cloud-import/cloud-import.service.ts`
- `backend/src/connections/connections.controller.ts`
- `backend/src/connections/connections.service.ts`
- `frontend/src/app/files/connections/page.tsx`
- `frontend/src/app/files/workflows/builder/page.tsx`
- `frontend/src/app/files/workflows/page.tsx`
- `frontend/src/app/globals.css`
- `frontend/src/components/connection-picker-logic.spec.ts`
- `frontend/src/components/connection-picker-logic.ts`
- `frontend/src/components/connection-picker.tsx`
- `frontend/src/lib/api/workflows.ts`

### Added
- `backend/src/connections/connection-browse-logic.ts`
- `backend/src/connections/connection-browse-logic.spec.ts`
- `frontend/src/components/workflow-node-palette.tsx`

## 3. Workflow Builder changes

- Removed **Choose a starting recipe** from create modal (`workflows/page.tsx`) and builder banner.
- New workflows default to one **Start** state at `{ x: 90, y: 100 }` with no prefilled transitions.
- Preserved canvas features from `70163d1`: four-side ports, drag, multi-select, copy/paste, duplicate, undo/redo, auto layout, zoom, snap/free move, space/middle-mouse pan.
- Step 2 uses CSS grid layout: palette sidebar | canvas column (toolbar + canvas) | inspector; bottom status bar with minimap + counts.

## 4. Node Palette changes

- New `WorkflowNodePalette` component outside the canvas.
- Nodes: Trigger, Action, Condition, Approval, HTTP Request, Custom Function, Import External File, End.
- Each maps to real workflow actions/states (HTTP Request → `http_request`, Import External File → `connection_file`, etc.).
- Supports click-to-add, drag-to-canvas, search, categories.

## 5. State dragging

- Unchanged core drag logic in `WorkflowCanvas` (pointer on state body; ignores buttons/ports/inputs).
- Canvas chrome moved out of the scrollable pane so palette no longer overlays nodes.

## 6. Connection picker fix

- `ActionEditor` loads **all** connections (not only `ACTIVE`) so expired connections appear with reconnect guidance.
- `ConnectionPicker` stores real `connectionId`; HTTP/Get File reset dependent fields on connection change.
- Browse API supports `pageToken`; resource picker has **Load more** pagination.
- Structured backend errors parsed in `connection-picker-logic.ts`.

## 7. Google Drive diagnosis

**Root cause of “Google Drive access was denied”:**

1. OAuth activation probe validates identity (`userinfo`) only — a connection can be **ACTIVE** without `drive.readonly`.
2. Drive browse/import then receives HTTP **403** because the access token lacks file-read scope.
3. Additional bug: browse used non-refreshing token path; expired tokens could also surface as access denied.

## 8. OAuth scope handling

- Added `googleDriveScopeGranted()` and block browse/list when Google connection lacks Drive read scope.
- Governance now reports `INSUFFICIENT_SCOPE` when stored scopes omit Drive access.
- Cloud Import returns `INSUFFICIENT_SCOPE` on Google 403 instead of a generic denial message.
- Valid connections with Drive scope are not forced to re-auth.

## 9. Cloud Import results

| Test | Result | Notes |
|------|--------|-------|
| Provider list / browse code path | PASS (unit) | Scope + token refresh logic covered |
| Job worker → WorkDrive file | BLOCKED | No live Google OAuth + storage worker runtime in this session |

## 10. Workflow test results

| Scenario | Result | Notes |
|----------|--------|-------|
| Manual Start → Action → End | BLOCKED | Requires running backend + authenticated UI session |
| Condition branch | BLOCKED | Same |
| HTTP Request + Connection | BLOCKED | Picker/runtime fixed in code; not browser-verified |
| Custom Function | BLOCKED | Same |
| Import External File | BLOCKED | Same |

Backend `workflow-runtime.spec.ts`: **PASS** (with browse logic tests).

## 11. Connection sharing

- **Fix:** `listWorkflowParticipants()` returns membership rows `{ user: {...} }`; sharing UI now maps to `user` objects and loads members when opening Connection Details.
- Sharing / Transfer Ownership sections render when org members exist and user `canManage`.

## 12. Transfer ownership

- Backend `POST /connections/:id/transfer-ownership` already existed; no fake UI added.
- UI uses real API; live transfer not executed in this session (**BLOCKED** for manual verification).

## 13. TypeScript result

| Area | Result |
|------|--------|
| Backend `nest build` | PASS |
| Frontend `next build` | PASS |

## 14. Build result

| Command | Exit |
|---------|------|
| `backend`: `npx nest build` | 0 |
| `frontend`: `npm run build` | 0 |

## 15. Browser E2E result

**BLOCKED** — Playwright gate not run (requires full stack + auth + OAuth env).

## 16. Remaining BLOCKED items

- Real Google OAuth → browse → cloud import E2E
- Workflow manual test runs in UI
- Playwright E2E
- `frontend` tests using `@jest/globals` (`workflow-access.spec.ts`, `manual-workflow-binding.spec.ts`) — pre-existing harness mismatch with `node:test` runner

## 17. Security notes

- Connections still validated per-user/org visibility before browse/import.
- OAuth tokens refreshed server-side; expired/missing-scope connections cannot browse Drive files.
- Connection picker continues to avoid exposing secrets client-side.

## 18. Recommended next phase

1. Configure Google OAuth with `drive.readonly` in org provider config; reconnect legacy connections once.
2. Run authenticated Playwright flows for Connection Picker + Cloud Import + Workflow run history.
3. Migrate remaining Jest-style frontend specs to `node:test` for consistent CI.
4. Optional: add Drive scope probe during OAuth activation (lightweight Drive metadata call) to prevent false ACTIVE status.
