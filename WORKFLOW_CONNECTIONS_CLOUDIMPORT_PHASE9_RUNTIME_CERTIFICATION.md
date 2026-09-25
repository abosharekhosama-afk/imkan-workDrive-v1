# WORKFLOW_CONNECTIONS_CLOUDIMPORT_PHASE9_RUNTIME_CERTIFICATION

Generated: 2026-09-25 · Branch: `v2-release` · Base commit: `698f488`

## 1. Git state

| Item | Value |
|------|-------|
| Branch | `v2-release` |
| Base commit | `698f488` — `feat(workflows): improve builder connections and cloud import` |
| Commits after base (before Phase 9 commit) | None |
| Working tree | Phase 9 changes only (no reset, no force checkout) |

## 2. Phase 9 scope

Runtime certification for Workflow / Connections / Cloud Import paths blocked in Phase 8. No cosmetic UI work. No mock runtime success. Unit tests ≠ live integration.

## 3. Files changed (Phase 9)

### Modified
- `backend/src/cloud-import/cloud-import.service.ts`
- `backend/src/connections/connection-browse-logic.ts`
- `backend/src/connections/connection-browse-logic.spec.ts`
- `backend/src/connections/connections.service.ts`
- `backend/src/connections/oauth-activation.spec.ts`
- `frontend/src/app/files/connections/connection-card-logic.ts`
- `frontend/src/app/files/connections/page.tsx`
- `frontend/src/components/connection-picker-logic.ts`
- `frontend/src/components/connection-picker-logic.spec.ts`
- `frontend/src/components/connection-picker.tsx`
- `frontend/src/components/manual-workflow-binding.spec.ts`
- `frontend/src/components/workflow-access.spec.ts`
- `frontend/src/lib/api/workflows.ts`

### Added
- `WORKFLOW_CONNECTIONS_CLOUDIMPORT_PHASE9_RUNTIME_CERTIFICATION.md`

## 4. Frontend test harness fix

| Test file | Before | After |
|-----------|--------|-------|
| `workflow-access.spec.ts` | FAIL — `@jest/globals` missing | **PASS** — converted to `node:test` |
| `manual-workflow-binding.spec.ts` | FAIL — `@jest/globals` missing | **PASS** — converted to `node:test`, updated contracts to match `file-browser.tsx` |

**Frontend full suite:** **PASS** — 159 passed, 0 failed, 2 skipped (`npm run test`)

## 5. Google OAuth scope handling at activation

| Check | Result |
|-------|--------|
| Drive scope evaluated after OAuth callback | **PASS** (code) |
| Connection stays `ACTIVE` for identity | **PASS** |
| Missing Drive scope sets `errorCode=DRIVE_SCOPE_REQUIRED` | **PASS** (unit: `oauth-activation.spec.ts`) |
| Capabilities stored in metadata + API `capabilities` field | **PASS** |
| Non-Google providers unaffected | **PASS** |
| Live Google OAuth callback | **BLOCKED** — provider credentials unavailable |

## 6. Connection status model

| State | Meaning |
|-------|---------|
| `ACTIVE` | OAuth identity valid (userinfo probe succeeded) |
| `errorCode=DRIVE_SCOPE_REQUIRED` | Google identity OK but Drive file-read scope missing |
| `capabilities.identity` | `granted` for Google OAuth |
| `capabilities.driveRead` | `granted` or `required` |

No schema migration required.

## 7. Reconnect flow (legacy Google connections)

| Check | Result |
|-------|--------|
| Browse/Get File/Cloud Import block with `INSUFFICIENT_SCOPE` | **PASS** (code) |
| User-facing message: "Google Drive file access is not authorized for this connection." | **PASS** |
| Reconnect button label: "Reconnect Google Drive" | **PASS** (picker + details modal) |
| OAuth `returnTo` sanitized via existing `normalizeOAuthReturnPath` | **PASS** (existing) |
| Live reconnect → Drive browse works | **BLOCKED** — no Google OAuth environment |

## 8. Google Drive browse live path

| Check | Result |
|-------|--------|
| Scope gate before browse | **PASS** (code) |
| Token refresh via `getAccessTokenById` | **PASS** (code) |
| 401 → refresh → single retry (`googleDriveRequest`) | **PASS** (code) |
| 403 scope vs permission mapping (`mapGoogleDriveApiError`) | **PASS** (unit) |
| Pagination / nextPageToken | **PASS** (Phase 8, unchanged) |
| Live root → folder → file browse | **BLOCKED** — no Google OAuth |

## 9. Cloud Import E2E

| Check | Result |
|-------|--------|
| Scope check before Google import | **PASS** (code) |
| Token refresh path (generic connection ID) | **PASS** (Phase 8) |
| Job → worker → storage → File record | **BLOCKED** — no live Google + worker runtime |

## 10. Workflow test runs (A–F)

| Scenario | Result |
|----------|--------|
| A Manual → Action → End | **BLOCKED** — no authenticated runtime session |
| B Manual → Condition → Branch A | **BLOCKED** |
| C Manual → Condition → Branch B | **BLOCKED** |
| D Manual → HTTP Request → Connection | **BLOCKED** |
| E Manual → Custom Function | **BLOCKED** |
| F Manual → Import External File | **BLOCKED** |
| `workflow-runtime.spec.ts` (unit) | **PASS** — 4 tests |

## 11. HTTP Request + Connection

| Check | Result |
|-------|--------|
| `connectionId` reaches backend / credentials server-side | **PASS** (code review + existing unit tests) |
| Live GET/POST through real connection | **BLOCKED** |

## 12. Get File + Connection

| Check | Result |
|-------|--------|
| Resource reset on connection change (Phase 8) | **PASS** (unchanged) |
| Live Google resource pick + workflow execution | **BLOCKED** |

## 13. Custom Function

| Check | Result |
|-------|--------|
| Executor unit tests | **PASS** (existing specs, not re-run in full) |
| Live SAFE runtime execution | **BLOCKED** |

## 14. Connection sharing

| Check | Result |
|-------|--------|
| Members loaded from org participants (Phase 8 fix) | **PASS** (code) |
| Live Add/Remove member + auth enforcement | **BLOCKED** — no authenticated browser/API session |

## 15. Transfer ownership

| Check | Result |
|-------|--------|
| Backend endpoint exists | **PASS** (code) |
| Live transfer + audit | **BLOCKED** |

## 16. Connection Details UI

| Check | Result |
|-------|--------|
| Provider / Account / Status | **PASS** (existing) |
| Capabilities: Identity + Drive file access | **PASS** (Phase 9) |
| Reconnect shown when `DRIVE_SCOPE_REQUIRED` on ACTIVE connection | **PASS** (code) |
| No tokens displayed | **PASS** |

## 17. Workflow Builder QA

| Check | Result |
|-------|--------|
| Palette outside canvas (Phase 8 layout) | **PASS** (code review, no regression in Phase 9) |
| Live drag/drop/save/reload browser QA | **BLOCKED** — no authenticated browser session |

## 18. Workflow save / reload

| Item | Result |
|------|--------|
| Workflow states/transitions/action config in DB | **PASS** (existing architecture) |
| Canvas layout | **localStorage only** (`workflow-layout:${workflowId}:v2`) — not persisted to DB |

## 19. Google OAuth environment

| Variable | Status |
|----------|--------|
| `GOOGLE_CLIENT_ID` | **MISSING** |
| `GOOGLE_CLIENT_SECRET` | **MISSING** |
| `GOOGLE_CALLBACK_URL` | **MISSING** |
| Backend `.env` | Not present in workspace |

**Classification:** **BLOCKED — Google OAuth provider environment unavailable**

## 20. Test matrix

| Area | Result |
|------|--------|
| Frontend unit tests | **PASS** (159/159 runnable) |
| Backend connection browse/OAuth unit tests | **PASS** (11) |
| Backend workflow-runtime unit tests | **PASS** (4) |
| Backend build (`nest build`) | **PASS** |
| Frontend build (`next build`) | **PASS** |
| Browser E2E / Playwright | **BLOCKED** |
| Google OAuth live | **BLOCKED** |
| Google Drive browse live | **BLOCKED** |
| Cloud Import file landing | **BLOCKED** |
| Workflow manual runs live | **BLOCKED** |
| Sharing live | **BLOCKED** |
| Transfer ownership live | **BLOCKED** |

## 21. Root causes (Google Drive)

1. **Historical:** OAuth activation validated identity only; connections could be `ACTIVE` without `drive.readonly`.
2. **Phase 9 fix:** After callback, scope is inspected; missing Drive scope → `ACTIVE` + `DRIVE_SCOPE_REQUIRED` + capability metadata.
3. **Live verification still blocked:** No Google OAuth credentials in this environment.

## 22. Remaining issues

- Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` (or org provider config in DB).
- Run live OAuth reconnect on a legacy Google connection and verify browse + cloud import end-to-end.
- Execute workflow scenarios A–F against running backend + worker + authenticated user.
- Run Playwright browser gate when auth session available.
- Consider persisting builder canvas layout to DB if product requires cross-device layout sync.

## 23. Security verification

| Check | Result |
|-------|--------|
| Access/refresh tokens not exposed in API responses | **PASS** |
| OAuth return path sanitized | **PASS** (existing) |
| Browse/import blocked without Drive scope | **PASS** |
| Connection credentials used server-side for HTTP Request | **PASS** (architecture) |

## 24. Certification statement

**NOT CERTIFIED for live Google Drive / Cloud Import / Workflow runtime integration.**

Phase 9 closes code-path and test-harness gaps from Phase 8. Live integration remains **BLOCKED** pending Google OAuth environment and authenticated runtime.
