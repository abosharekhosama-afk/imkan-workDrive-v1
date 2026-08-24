# Implementation Record: T-402 POST /files/upload-request

## Objective
Authenticated upload-request: validate tenant folder ownership, prepare `files` + `file_versions` metadata, return a StorageService presigned upload URL.

## Endpoint
`POST /files/upload-request` (JWT required via global guard)

Request (API contract): `{ name, folder_id, size, mime_type, sha256 }`  
Response: `{ upload_url, upload_id, file_id }`  
`upload_id` is the prepared `file_versions.id`.

## Files
- `backend/src/files/files.controller.ts`
- `backend/src/files/files.service.ts`
- `backend/src/files/files.module.ts`
- `backend/src/files/upload-request.schema.ts`
- `backend/src/files/upload-request.schema.spec.ts`
- `backend/src/files/files.service.spec.ts`

## Security
- Tenant from JWT `org_id`, never from the body.
- Body `orgId` / `org_id` → 403.
- Missing or cross-tenant folder → 404 (no enumeration).
- MIME allowlist (S-3).
- Signed URL via `StorageService.createUploadUrl` with `ownerOrgId` from JWT.
- Object key built from authenticated tenant context.

## Tests executed
`npx nest build` — success  
`npx jest --runInBand --testPathPatterns="upload-request.schema.spec|files.service.spec"`  
2 suites, 6 tests, all passed. StorageService mocked. MinIO/Docker not used.

## Tests not executed
Live MySQL / Supertest e2e — NOT RUN (migrations not applied).

## Status
PASS (unit)
