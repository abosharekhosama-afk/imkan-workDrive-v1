# WORKFLOW_CONNECTIONS_CLOUDIMPORT_GOOGLE_DRIVE_API_FIX_REPORT

Generated: 2026-09-26 · Branch: `v2-release`

## 1. Root cause (confirmed)

Production error on:

`GET /cloud-import/google/files?connectionId=8d0bb24d-1ece-4d5d-9ae0-59354751a7f7`

**Real Google API response:** HTTP 403 with `reason=accessNotConfigured`

This is **not** an OAuth scope problem. Google returns `accessNotConfigured` when the **Google Drive API is disabled** (or never enabled) in the Google Cloud project tied to the OAuth client that issued the access token.

### Evidence

| Check | Finding |
|-------|---------|
| OAuth scopes granted on connection | `drive.readonly`, `drive`, `drive.file`, `drive.metadata.readonly`, identity scopes — **granted** |
| Cloud Import endpoint | `https://www.googleapis.com/drive/v3/files` (correct) |
| Token path | Cloud Import uses generic `Connection` via `genericConnectionId` → `ConnectionsService.getAccessTokenById()` |
| OAuth client in repo credentials JSON | `491774771733-...apps.googleusercontent.com` |
| Google Cloud project | `imkan-workdrive` (from OAuth client JSON `project_id`) |
| Callback configured in client JSON | `https://imkan-workdrive-v1.onrender.com/connections/oauth/google/callback` |

**Conclusion:** OAuth succeeded and scopes are valid, but **Google Drive API is not enabled** in project `imkan-workdrive`. Cloud Import correctly reaches Drive API and Google rejects the call before file listing.

### Why Connection Details showed "Drive file access: Granted"

Capabilities previously reflected **stored OAuth scopes only**, not whether Drive API calls succeed. That is now split into:

- **Drive OAuth scope** — granted / required
- **Google Drive API** — enabled / not enabled / unknown
- **Cloud Import** — ready / blocked

## 2. Why INSUFFICIENT_SCOPE appeared before

Earlier mapping in `mapGoogleDriveApiError` could treat some 403 responses ambiguously. `accessNotConfigured` was already handled separately in Cloud Import, but Connection capabilities and browse mapping did not distinguish **scope granted** vs **API disabled**.

## 3. Code changes

### New
- `backend/src/connections/google-drive-api-logic.ts` — centralized Google Drive API error classification
- `backend/src/connections/google-drive-api-logic.spec.ts`
- `backend/src/cloud-import/cloud-import.service.spec.ts`

### Modified
- `backend/src/connections/connection-browse-logic.ts` — capability model split (OAuth scope / Drive API / Cloud Import); scope alias fix for `email`/`profile`
- `backend/src/connections/connections.service.ts` — Drive API probe after OAuth; diagnostics; `recordGoogleDriveApiStatus()`; governance issue `GOOGLE_DRIVE_API_NOT_ENABLED`
- `backend/src/cloud-import/cloud-import.service.ts` — structured errors; shared classifier; token refresh only via Connections service
- `frontend/src/lib/api/client.ts` — parse nested Nest error objects with `code`
- `frontend/src/app/files/connections/connection-card-logic.ts` — capability labels + admin action text
- `frontend/src/app/files/connections/page.tsx` — Connection Details capabilities + admin guidance
- `frontend/src/components/connection-picker-logic.ts` — `GOOGLE_DRIVE_API_NOT_ENABLED` message
- `frontend/src/components/cloud-import-modal.tsx` — surface structured API errors

## 4. Structured Cloud Import error (example)

```json
{
  "code": "GOOGLE_DRIVE_API_NOT_ENABLED",
  "message": "Google Drive API is not enabled for the Google Cloud project used by this OAuth connection.",
  "connectionId": "8d0bb24d-1ece-4d5d-9ae0-59354751a7f7",
  "retryable": false,
  "action": "ENABLE_GOOGLE_DRIVE_API",
  "googleReason": "accessNotConfigured",
  "googleProject": "491774771733"
}
```

No access tokens or client secrets are exposed.

## 5. Tests

| Suite | Result |
|-------|--------|
| `google-drive-api-logic.spec.ts` | **PASS** |
| `connection-browse-logic.spec.ts` | **PASS** |
| `cloud-import.service.spec.ts` | **PASS** |
| `oauth-activation.spec.ts` | **PASS** |
| Frontend `npm run test` | **PASS** (159/159 runnable) |

## 6. Build

| Target | Result |
|--------|--------|
| Backend `nest build` | **PASS** |
| Frontend `next build` | Run locally after deploy prep |

## 7. Production / live verification

| Check | Status |
|-------|--------|
| CODE PASS | Yes |
| UNIT PASS | Yes |
| BUILD PASS | Backend yes |
| LIVE Cloud Import file listing | **BLOCKED until Google Drive API enabled** |
| LIVE import to WorkDrive storage | **BLOCKED** (depends on API enablement) |

**NOT certified for live Cloud Import** until Google Cloud step below is completed.

## 8. Required Google Cloud Console steps (manual)

Project: **`imkan-workdrive`**

OAuth client: **`491774771733-...apps.googleusercontent.com`**

1. Open [Google Cloud Console → APIs & Services → Library](https://console.cloud.google.com/apis/library)
2. Select project **`imkan-workdrive`**
3. Enable **Google Drive API** (`drive.googleapis.com`)
4. Confirm OAuth consent screen includes Drive scopes (already granted on reconnect)
5. Optional: enable **Google People API** if you want literal `email`/`profile` scope names in audit (Google often returns `userinfo.email` / `userinfo.profile` instead — now treated as equivalent)
6. Retry Cloud Import browse for connection `8d0bb24d-1ece-4d5d-9ae0-59354751a7f7`

Direct enable link (project number from typical error body):

`https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=imkan-workdrive`

## 9. Render environment checklist (no secrets)

Ensure Production backend has consistent values:

- `GOOGLE_CLIENT_ID` — must match OAuth client above
- `GOOGLE_CLIENT_SECRET` — same client
- `GOOGLE_CONNECTION_CALLBACK_URL` or default `/connections/oauth/google/callback`
- `PUBLIC_API_URL=https://imkan-workdrive-v1.onrender.com`
- `FRONTEND_URL` — frontend origin (not API URL)

Cloud Import OAuth uses **Connections OAuth** (`beginOAuth` → `completeOAuth`), not a separate client. Do **not** point `GOOGLE_CLIENT_ID` at a different project than where Drive API is enabled.

## 10. After API enablement — expected flow

1. Reconnect Google connection (or open Connection Details → Reconnect) to refresh Drive API probe metadata
2. Connection Details should show:
   - Drive OAuth scope: **Granted**
   - Google Drive API: **Granted** (was Not enabled)
   - Cloud Import: **Granted** (was Blocked)
3. `GET /cloud-import/google/files?connectionId=...` returns file list
4. Import job can download file → WorkDrive storage → File record
