# Integration API keys (inbound)

Integration API keys let a trusted external app (first consumer: **OMA**) store and read
files in one WorkDrive organization without a user session.

- Token format: `wdk_<12 hex lookup>_<43 char secret>` — e.g. `wdk_b7701f73243a_Mc...`.
- Send it as `Authorization: Bearer wdk_...` to the same API base URL as the web app.
- Only a SHA-256 hash of the full token is stored (`integration_api_keys.secret_hash`).
  The full token is returned **once**, at creation.
- A key acts as a service principal of the admin who created it (`sub` = creator,
  `org_id` = key org). Existing permission checks still apply. If the creator's membership
  is no longer `ACTIVE`, the key stops working.
- Every request with a key writes an `INTEGRATION_KEY_USED` audit log entry and updates
  `lastUsedAt`. Create and revoke write `INTEGRATION_KEY_CREATED` / `INTEGRATION_KEY_REVOKED`.
- Rate limit: per key, `INTEGRATION_KEY_RATE_LIMIT_PER_MINUTE` (default 600), in-memory per
  instance → `429`. The existing global per-IP limiter still applies as well.

## Scopes

| Scope | Allows |
|---|---|
| `folders:read` | `GET /folders/:id`, `GET /folders` (org-wide keys only) |
| `folders:write` | `POST /folders`, `POST /folders/ensure-path`, `DELETE /folders/:id` |
| `files:read` | `GET /files/:id/details`, `/download`, `/preview-url`, `/stream` |
| `files:write` | `POST /files/upload-request`, `POST /files/upload-complete`, `/files/upload-sessions/*`, `DELETE /files/:id` |
| *(none)* | `GET /integration/self` |

Any route not listed returns `403` for integration keys (including all `/admin/*` routes).

## Root folder confinement

If a key has `rootFolderId`, every folder/file it touches must be the root folder or a
descendant of it; anything else returns `404` (no existence leak). Additionally:

- Uploads and `POST /folders` **must** specify a folder/parent inside the root (`403` otherwise).
- `GET /folders` (top-level listing) returns `403`; list `GET /folders/{rootFolderId}` instead.
- `DELETE /folders/{rootFolderId}` returns `403`.
- Resources of another organization always return `404`, rooted or not.

## Admin endpoints (user session, org ADMIN or SUPER_ADMIN)

```
GET    /admin/integration-keys                 -> IntegrationKey[]
POST   /admin/integration-keys                 -> { key: IntegrationKey, secret: "wdk_..." }
       body: { name: string(1..120), scopes: Scope[], rootFolderId?: uuid|null, expiresAt?: ISO-8601|null }
POST   /admin/integration-keys/:id/revoke      -> IntegrationKey   (idempotent)
DELETE /admin/integration-keys/:id             -> same as revoke (the row is kept for audit)
```

`IntegrationKey = { id, name, prefix, scopes, rootFolder: {id,name}|null, createdBy, createdAt, lastUsedAt, revokedAt, expiresAt, status: "active"|"revoked"|"expired" }`

UI: **Admin Console → App Access Keys** (`/admin/integration-keys`).

## API reference for OMA

### Verify a key — `GET /integration/self`
```json
{ "keyId": "…", "prefix": "wdk_b7701f73243a",
  "organization": { "id": "…", "name": "Imkan Studio" },
  "scopes": ["files:read","files:write","folders:read","folders:write"],
  "rootFolder": { "id": "…", "name": "OMA" } }
```

### Resolve/create a folder path — `POST /folders/ensure-path` (`folders:write`)
Body: `{ "path": "tenant-123/brand-456/posts" }` (or `{ "segments": [...] }`), optional `parentId`.
With a rooted key the path is resolved under the root folder. Idempotent and safe under
concurrency (MySQL `GET_LOCK` per parent+name). Max 20 segments, each 1–191 chars, no `..`,
no `\ : * ? " < > |` or control characters.
```json
{ "folderId": "…", "name": "posts",
  "path": [{"id":"…","name":"tenant-123"},{"id":"…","name":"brand-456"},{"id":"…","name":"posts"}],
  "created": true, "createdFolderIds": ["…"] }
```

### Upload a small/medium file (single PUT)
1. `POST /files/upload-request` (`files:write`)
   `{ "name": "post.png", "folder_id": "<folderId>", "size": 12345, "mime_type": "image/png", "sha256": "<hex>" }`
   → `{ upload_id, file_id, upload_url, … }`
2. `PUT <upload_url>` with the raw bytes (signed URL; no Authorization header).
3. `POST /files/upload-complete` `{ "upload_id": "<upload_id>" }` → file record.

### Upload a large file / video (resumable)
1. `POST /files/upload-sessions` `{ folderId, name, mimeType, size, sha256, partSize? }`
   (partSize 5–100 MiB, default 16 MiB) → `{ session_id, file_id, part_size, total_parts, expires_at }`
2. `POST /files/upload-sessions/:sessionId/parts/:n` multipart field `chunk`, header `x-part-sha256`.
3. `POST /files/upload-sessions/:sessionId/complete`. Status: `GET /files/upload-sessions/:sessionId`.
   Abort: `DELETE /files/upload-sessions/:sessionId`.

### List — `GET /folders/:id` (`folders:read`)
Returns the folder and its child folders and files (same shape as the web app).

### Read
- `GET /files/:id/details` (`files:read`) — file metadata (name, size, mime type, folder, owner).
- `GET /files/:id/download` → `{ download_url, expires_in_seconds, file_id }` (attachment disposition).
- `GET /files/:id/preview-url` → `{ preview_url, expires_in_seconds, file_id, file_name, mime_type }` (inline).
- `GET /files/:id/stream` — byte stream with HTTP `Range` support (video playback).

Signed URLs expire after `S3_SIGNED_URL_EXPIRES_SECONDS` (default 900 s). OMA should store
the `file_id`, not the URL, and request a fresh URL when it needs one.

### Delete
- `DELETE /files/:id` (`files:write`) — moves the file to trash (restorable by WorkDrive users).
- `DELETE /folders/:id` (`folders:write`) — only empty folders; never the key's root.

## Errors
`401` invalid/revoked/expired key or creator no longer active · `403` missing scope, route not
open to keys, or root rule · `404` outside root / other org / not found · `429` rate limit.

## Deploy
1. `npx prisma migrate deploy` (adds `20261026120000_integration_api_keys`).
2. Optional env: `INTEGRATION_KEY_RATE_LIMIT_PER_MINUTE` (default 600).
3. An admin creates a key in **App Access Keys**, limited to a folder such as `OMA`, and pastes it into OMA.

## Not included yet
Outgoing webhooks (file created/deleted), long-lived public URLs for social publishing,
and a distributed (Redis) rate limiter for multi-instance deployments.
