# Contract: Team Folder APIs

Base URL: same origin as existing Nest app (no `/api/v1` prefix — matches current controllers).

Authentication: `Authorization: Bearer <JWT>` with `sub`, `org_id`, `role`. Tenant is JWT `org_id`. Do not send `orgId` in body or query for authorization.

## POST /team-folders

**Auth**: org ADMIN  
**Body**: `{ "name": string }` (non-empty, same name rules as folders)  
**201**: `{ "id", "orgId", "name", "rootFolderId" }`  
**400** invalid name; **401** missing JWT; **403** JWT is MEMBER (caller is authenticated in-tenant but cannot create TF — existence of “create” is not a hidden resource, 403 is acceptable here)

## GET /team-folders

**Auth**: any valid org JWT  
**200**: `{ "teamFolders": [ { "id", "name", "rootFolderId", "role" } ] }`  
`role` is the caller’s Team Folder role, or `"ORG_ADMIN"` when `users.role` is ADMIN (even without membership). Omit Team Folders the caller cannot read.

## GET /team-folders/:id

**Auth**: canRead  
**200**: Team Folder + `rootFolderId`  
**404**: unknown, cross-tenant, or non-member non-admin

## PATCH /team-folders/:id

**Auth**: org ADMIN or TF ADMIN  
**Body**: `{ "name": string }`  
**200**: updated TF  
**403**: canRead but not allowed to rename TF  
**404**: cannot read

## DELETE /team-folders/:id

**Auth**: org ADMIN or TF ADMIN  
**200**: `{ "id", "deleted": true }`  
**400**: not empty (child folders or files still reference it)  
**403** / **404**: per matrix

## GET /team-folders/:id/members

**Auth**: canRead  
**200**: `{ "members": [ { "userId", "email", "role" } ] }`  
**404**: cannot read

## POST /team-folders/:id/members

**Auth**: manage members (see spec matrix)  
**Body**: `{ "userId": uuid, "role": "ADMIN"|"ORGANIZER"|"EDITOR"|"VIEWER" }`  
**201**: membership  
**400**: last-admin rules / invalid role for ORGANIZER actor  
**404**: TF not readable or target user not in org

## PATCH /team-folders/:id/members/:userId

**Auth**: manage members  
**Body**: `{ "role": TeamFolderRole }`  
**200**: updated  
**400** / **403** / **404**: per matrix and last TF ADMIN

## DELETE /team-folders/:id/members/:userId

**Auth**: manage members  
**200**: `{ "teamFolderId", "userId", "deleted": true }`  
**400**: would remove last TF ADMIN

## Existing endpoints — ACL overlay (not new paths)

| Endpoint | Extra rule |
| :--- | :--- |
| `POST /folders` | Inherit/validate `teamFolderId`; require `canWrite` |
| `GET /folders`, `GET /folders/:id` | Filter by `canRead`; 404 if folder unreadable |
| `PATCH/DELETE /folders/:id` | 404 if !canRead; 403 if canRead && !canWrite |
| `POST /files/upload-request` | `canWrite` folder before upload URL |
| `GET /files/:id/download` | `canRead` file before download URL |
| `PATCH/DELETE /files/:id`, `POST /files/:id/restore` | 404 / 403 per canRead/canWrite |
| `GET /files/trash` | Only files caller canRead |
| `POST /shares` | `canShare`; 404 if !canRead |
| `GET /search?q=` | Only canRead hits |
| `POST /shares/:token/verify` | Unchanged (public capability) |

## Error body

Reuse existing Nest HTTP exceptions (`NotFoundException`, `ForbiddenException`, `BadRequestException`). Do not add a distinct error code that names a hidden Team Folder for 404 cases.
