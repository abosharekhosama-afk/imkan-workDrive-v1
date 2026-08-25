# Implementation Record: T-401 Storage abstraction

## Objective
Provider-neutral storage contract with an S3-compatible adapter for upload/download signed URLs and tenant-isolated object keys.

## Files
- `backend/src/storage/storage.types.ts` — `StorageService` contract
- `backend/src/storage/object-key.ts` — `tenant_{orgId}/files/{fileId}/{versionUuid}`
- `backend/src/storage/s3-compatible.storage.ts` — AWS SDK adapter
- `backend/src/storage/storage.module.ts`
- `backend/src/storage/object-key.spec.ts`
- `backend/src/storage/s3-compatible.storage.spec.ts`
- `backend/.env.example` — S3 env names only, no secrets

## Behavior
- Tenant id comes from AsyncLocalStorage (authenticated server context), never from client `orgId`.
- Client-supplied `orgId` on the request object is rejected.
- `ownerOrgId` must match the authenticated tenant or the call is forbidden.
- Object keys always use the authenticated org id.
- Signed URLs expire in 900 seconds by default (S-4).
- S3 client is injected; endpoint is optional so MinIO or AWS can be configured later.

## Tests executed
`npx nest build` — success  
`npx jest --runInBand --testPathPatterns="object-key.spec|s3-compatible.storage.spec"`  
2 suites, 8 tests, all passed. S3 client mocked; MinIO not required.

## Tests not executed
Live MinIO/AWS integration — NOT RUN (no object store started).

## Status
PASS (unit)
