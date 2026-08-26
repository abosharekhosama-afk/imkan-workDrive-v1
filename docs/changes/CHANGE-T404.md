# Implementation Record: T-404 GET /files/:id/download

## Objective
Issue a tenant-scoped presigned download URL for the latest file version and write an audit log.

## Endpoint
`GET /files/:id/download` (JWT required)

Response: `{ download_url, expires_in_seconds, file_id }`

## Files
- `backend/src/files/files.service.ts` (`createDownloadUrl`)
- `backend/src/files/files.controller.ts`
- `backend/src/files/files.service.spec.ts`

## Security
- Tenant from JWT `org_id`.
- Cross-tenant or missing file → 404.
- Soft-deleted files → 404 (`deletedAt: null` filter).
- Signed GET URL via `StorageService.createDownloadUrl` with `ownerOrgId` from JWT.

## Tests executed
Same Nest build + jest run as T-403. Download happy path, IDOR 404, soft-delete 404 passed.

## Status
PASS (unit). Live S3/MySQL: NOT RUN.
