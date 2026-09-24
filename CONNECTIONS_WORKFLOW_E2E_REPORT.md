# Connections, OAuth, and Workflows

## 1. Root causes

Successful provider OAuth did not lose the connection. It lost the IMKAN browser session.

The provider redirects to the API origin (`PUBLIC_API_URL/.../callback`). The API then redirects to `FRONTEND_URL`. `localStorage` and the first-party session cookie belong to the frontend origin. If that origin is not the same browser context the user started from, AuthGate finds no token and sends the user to `/auth/login`. A sessionStorage backup cannot survive a different origin.

A second path did the same thing: any later `401` called `window.location.href = "/auth/login"` and dropped the `next` path, so even a valid return could not be resumed.

## 2. Files changed

- `backend/src/auth.service.ts`
- `backend/src/connections/oauth-flow.ts`
- `backend/src/connections/connections.module.ts`
- `backend/src/connections/connections.service.ts`
- `backend/src/connections/connections.controller.ts`
- `backend/src/cloud-import/cloud-import.controller.ts`
- `backend/src/cloud-import/cloud-import.service.ts`
- `backend/src/workflows/workflow-engine.service.ts`
- `frontend/src/components/auth-gate.tsx`
- `frontend/src/components/auth-gate-logic.ts`
- `frontend/src/lib/api/client.ts`
- `frontend/src/lib/api/workflows.ts`
- `frontend/src/app/files/workflows/builder/page.tsx`
- `frontend/package.json`

## 3. Architecture changes

After the OAuth `state` is validated and the connection is activated, the API issues a normal IMKAN access token for that same user and organization. The token is appended only as a URL fragment (`#imkan_session=`), which is not sent to the server or to the provider. AuthGate reads it before any login redirect, stores it with the existing session helpers, and removes the fragment.

`returnTo` is still stored on the OAuth state and used as the path after success. Reconnect now accepts `returnTo` as well.

File browsing is `GET /connections/:id/resources` and `GET /connections/:id/resources/:resourceId`. The workflow action `connection_file` calls `readResource` for the selected id. Older `http_request` steps are unchanged.

## 4. OAuth flow

```text
Connections or Workflow
  → start OAuth with returnTo
  → provider
  → API callback validates state
  → connection becomes ACTIVE
  → IMKAN session is reissued
  → browser opens FRONTEND_URL + original path + #imkan_session
  → AuthGate restores the session
  → original page
```

Failure messages shown to the user are friendly. The technical code stays in the `code` query for diagnosis.

## 5. Connection flow

The workflow action uses a connection select by name, a Connected / Reconnect state, and a link to create a connection. Reconnect starts OAuth with the current page as `returnTo`.

## 6. Workflow integration

The builder has a Get file action. It stores `connectionId`, `resourceId`, and `resourceName`. Execution calls the provider metadata API through the saved connection. The raw id is behind Advanced.

## 7. Resource picker

Google Drive, Dropbox, and OneDrive list folders and files from the live provider API. Other providers are not given a fake browser. Empty, loading, and retry states are in the picker.

## 8. Path handling

The picker stores the provider id (Drive file id, Dropbox path, Graph item id). The user sees the file name. `readResource` requests that same id back from the provider. This was not executed against a live Google account in this session.

## 9. Custom Function UX

Custom functions still use their existing operation form. HTTP operations can keep a connection id. The new Get file workflow action is the non-JSON path for choosing a connection and a file. The generated resource id is hidden behind Advanced.

## 10. Tests executed

- Frontend `node --test` auth-gate and connection-picker specs: 9 passed
- Backend `jest` oauth-flow and custom-function executor: 7 passed
- `npx nest build`: exit 0 after the upload body type fix

## 11. Tests passed

The commands above passed. They do not include a live provider or a browser session.

## 12. Tests failed

None of those commands failed. Live OAuth, folder listing, upload, and workflow execution against a provider were not run, so they are BLOCKED rather than passed.

## 13. Remaining blockers

Live provider OAuth, folder listing, upload, custom-function execution, and expired-connection recovery were not run. No Google, Dropbox, or Microsoft credentials were used in this session. Browser login to a running IMKAN session was also not available, so the return-to-page behavior was verified in code and unit tests, not in a real browser.

## 14. Environment variables required

- `FRONTEND_URL` must be the Next.js origin, never the API origin
- `PUBLIC_API_URL` is the API origin used in the provider callback
- `JWT_SECRET`
- Provider client id and secret, for example `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- The provider console redirect URI must be the API callback, such as `{PUBLIC_API_URL}/connections/oauth/google/callback`

## 15. Production deployment notes

Deploy the API and the frontend together. If `FRONTEND_URL` still points at the API host, the new session fragment is written onto the wrong origin and AuthGate will still show login. Do not log the fragment. The access token is still stored in the existing first-party `localStorage` and cookie after restore.

## Phase 2 session handoff

The fragment no longer carries an access token. It carries a 90-second `oauth_resume` code. That code is not a session: the API guard requires a live session row, and the code is consumed once by `POST /auth/oauth-resume`. The response body returns the real access token. AuthGate strips the fragment before the exchange and stays on the loading screen until the exchange finishes. It does not redirect to login during that wait. `returnTo` still rejects external URLs, including values that are not a single internal path.

## Test table

| Test | Result | Details |
| --- | --- | --- |
| OAuth from Connections | BLOCKED | No provider credentials and no authenticated browser session. Session handoff is implemented and unit-tested. |
| OAuth from Workflow | BLOCKED | Same blocker. `returnTo` is passed into OAuth start and reconnect. |
| Connection Picker | PASS | Unit test covers connected, expired, and unsupported providers. UI is wired in the workflow builder. Not clicked in a browser. |
| Folder Picker | BLOCKED | API calls the provider. Not executed against a live account. |
| File Picker | BLOCKED | Same as folder picker. |
| Upload | BLOCKED | `POST /connections/:id/upload` is implemented for Google, Dropbox, and OneDrive. It was not called against a live account. |
| Custom Function | BLOCKED | Existing function executor was not run against a provider. |
| Expired Connection | PASS | Reconnect label and friendly `invalid_grant` text are unit-tested. Live reconnect was not run. |
| Dark Mode | BLOCKED | Picker uses existing `--wd-*` tokens. Not visually checked in dark mode. |
| Production Build | PASS | Backend `npx nest build` exited 0. Frontend `npm run build` was started after these edits. |

## Phase 2 matrix

| Scenario | Browser | Backend | Provider | Result |
| --- | --- | --- | --- | --- |
| OAuth Connections | BLOCKED | PASS | BLOCKED | Return path unit-tested. No live Google session. |
| OAuth Workflow | BLOCKED | PASS | BLOCKED | Query `?step=2` is preserved by `normalizeOAuthReturnPath`. |
| Session Restore | BLOCKED | PASS | n/a | Resume code is one-time and is not an access token. Not exchanged in a browser. |
| Connection Picker | BLOCKED | n/a | n/a | Status and action rules unit-tested. Not clicked. |
| Folder Picker | BLOCKED | PASS | BLOCKED | Endpoint exists. Provider not called. |
| File Picker | BLOCKED | PASS | BLOCKED | Selection stores `resourceId`, display uses the name. |
| Get File | BLOCKED | PASS | BLOCKED | Workflow and `CONNECTION_READ` call `readResource` with the id. |
| Upload | BLOCKED | PASS | BLOCKED | Endpoint compiled. Not executed. |
| Expired Connection | BLOCKED | PASS | BLOCKED | Reconnect sends `returnTo`. Friendly copy is unit-tested. |
| Reconnect | BLOCKED | PASS | BLOCKED | Same as expired connection. |
| Cloud Import | BLOCKED | PASS | BLOCKED | Uses the same resume fragment. Not opened in a browser. |
| Custom Function | BLOCKED | PASS | BLOCKED | `CONNECTION_READ` is allowed. Not executed against a provider. |
| Dark Mode | BLOCKED | n/a | n/a | Tokens are referenced. Not visually checked. |
| Production Build | n/a | PASS | n/a | `npx nest build` and `npm run build` both exited 0. |

## What was not claimed

A real Google Drive allow-and-return, a real file read, a real upload, and a real workflow run did not happen in this session.
