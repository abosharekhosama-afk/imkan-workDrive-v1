# API Technical Contracts

Base URL: `/` (no version prefix; see Note 1)
Auth: Bearer Token (JWT).
Tenant Isolation: Enforced via `org_id` in JWT payload matching resource `org_id`.

Note 1: Routes are not prefixed with `/api/v1` in the current implementation. This document reflects the actual routes.

## Domains

### Team Folders

| Method | Path | Auth | Success | Notes |
| :--- | :--- | :--- | :--- | :--- |
| POST | `/team-folders` | JWT, org ADMIN | 201 | Body `{ name }`. Creates TF + root folder. |
| GET | `/team-folders` | JWT | 200 | Only TFs the caller can read. |
| GET | `/team-folders/:id` | JWT, canRead | 200 | 404 otherwise. |
| PATCH | `/team-folders/:id` | JWT, rename TF | 200 | Body `{ name }`. |
| DELETE | `/team-folders/:id` | JWT, delete TF | 200 | Reject if child folders/files exist (400). |
| GET | `/team-folders/:id/members` | JWT, canRead | 200 | Member list; 404 if cannot read TF. |
| POST | `/team-folders/:id/members` | JWT, manage members | 201 | `{ userId, role }`. Target user same org. |
| PATCH | `/team-folders/:id/members/:userId` | JWT, manage members | 200 | `{ role }`. |
| DELETE | `/team-folders/:id/members/:userId` | JWT, manage members | 200 | Last TF ADMIN → 400. |

### Folders

| Method | Path | Auth | Success | Notes |
| :--- | :--- | :--- | :--- | :--- |
| POST | `/folders` | JWT | 201 | Body `{ name, parentId?, teamFolderId? }`. `teamFolderId` inherited from parent; client value ignored if conflicting. |
| GET | `/folders` | JWT | 200 | Root folders (parentId null). Team Folder roots hidden from non-members. |
| GET | `/folders/:id` | JWT, canRead | 200 | Folder metadata + children. 404 if cannot read. |
| PATCH | `/folders/:id` | JWT, canWrite | 200 | Body `{ name }`. |
| DELETE | `/folders/:id` | JWT, canWrite | 200 | Empty folder only. |

### Files

| Method | Path | Auth | Success | Notes |
| :--- | :--- | :--- | :--- | :--- |
| POST | `/files/upload-request` | JWT, canWrite on folder | 201 | `{ name, folder_id, size, mime_type, sha256 }` → `{ upload_url, upload_id, file_id }`. |
| POST | `/files/upload-complete` | JWT | 201 | `{ upload_id }` → `{ file_id, upload_id, status: 'complete' }`. |
| GET | `/files/:id/download` | JWT, canRead | 200 | `{ download_url, expires_in_seconds, file_id }`. Used for preview (PDF, image, video, text). |
| GET | `/files/:id/versions/:versionNumber/download` | JWT, canRead | 200 | `{ download_url, expires_in_seconds, file_id, version_number }`. Version-specific preview. |
| PATCH | `/files/:id` | JWT, canWrite | 200 | `{ name }`. |
| DELETE | `/files/:id` | JWT, canWrite | 200 | Move to trash. |
| POST | `/files/:id/restore` | JWT, canWrite | 201 | Restore from trash. |
| POST | `/files/:id/restore-version` | JWT, canWrite | 201 | `{ versionNumber }` → `{ fileId, newVersionNumber, restoredFromVersion }`. |
| GET | `/files/trash` | JWT | 200 | List trashed files (filtered by canRead). |

### File Preview (Frontend)

No new backend routes. Preview uses existing `GET /files/:id/download` signed URLs.
Supported MIME types: `application/pdf`, `image/*`, `video/mp4`, `video/webm`, `text/*`, `application/json`, `application/javascript`, `application/typescript`, `text/markdown`, `text/csv`, `text/html`, `text/css`, `application/sql`, `application/x-sh`.
Frontend components: `PdfPreview` (PDF.js), `ImagePreview` (native `<img>` + CSS), `VideoPreview` (native `<video>`), `TextPreview` (Prism.js).
Preview UI: Modal with toolbar, keyboard nav (Escape, Arrow keys), ARIA live regions, RTL support.
Direct preview links: `/files/[fileId]/preview` (frontend route).

### Shares

| Method | Path | Auth | Success | Notes |
| :--- | :--- | :--- | :--- | :--- |
| POST | `/shares` | JWT, canShare | 201 | `{ resource_type, resource_id, can_download?, expires_at?, password? }` → `{ link_url }`. |
| GET | `/share/public/:token` | none | 200 | Unauthenticated verify/download. Capability-based. |

### Search

| Method | Path | Auth | Success | Notes |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/search` | JWT | 200 | Query `q`. Returns `{ folders, files }` filtered by canRead. |

### Audit / Activity

| Method | Path | Auth | Success | Notes |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/files/activity` | JWT | 200 | Audit log entries for the organization. |

### Error Model

- 400 Bad Request (validation details).
- 401 Unauthorized.
- 403 Forbidden (RBAC failure; caller can read but action denied).
- 404 Not Found (also used when caller cannot read the resource to prevent enumeration).
- 500 Internal Error.

### Authorization Rules (Summary)

- **Personal resources** (`teamFolderId` null): Same-org read; write/share = org ADMIN or resource owner MEMBER.
- **Team Folder resources**: Default DENY. Org ADMIN or Team Folder membership with sufficient role required.
  - `canRead`: Org ADMIN, TF ADMIN, ORGANIZER, EDITOR, VIEWER (members only).
  - `canWrite`: Org ADMIN, TF ADMIN, ORGANIZER, EDITOR.
  - `canShare`: Org ADMIN, TF ADMIN, ORGANIZER, EDITOR.
  - `canManageTeamFolder`: Org ADMIN, TF ADMIN.
  - `canManageMembers`: Org ADMIN, TF ADMIN, ORGANIZER (EDITOR/VIEWER only).
- Cross-tenant: Always 404.
- `isPublicToOrg` flag: Ignored for ACL.
