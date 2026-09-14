# Implementation Record: T-405 Local object storage (no Docker)

## Objective
Validate real byte storage outside MySQL on Windows without Docker, MinIO, or AWS.

## Approach
Keep `StorageService` unchanged. Add `LocalDiskStorageAdapter` selected by `STORAGE_DRIVER=local` (default). Signed URLs target `PUT/GET /storage/objects?token=…` with HMAC tokens (`object-access-token.ts`). S3 adapter remains available via `STORAGE_DRIVER=s3`.

## Files
- `backend/src/storage/local-disk.storage.ts`
- `backend/src/storage/object-access-token.ts`
- `backend/src/storage/storage-objects.controller.ts`
- `backend/src/storage/storage.module.ts` — driver switch
- `backend/test/storage.integration.e2e-spec.ts` — MySQL + disk integration
- `docs/LOCAL-OBJECT-STORAGE.md`

## Share integration
`POST /share/public` now returns optional `download_url` when `can_download` is true for a file share.

## Tests executed
- `npx nest build` — success
- `npx jest --runInBand --testPathPatterns="object-access-token|local-disk.storage|object-key|s3-compatible|shares.service|files.service"` — 6 suites, 36 passed
- `npm run test:e2e -- --testPathPatterns=storage.integration` — 1 suite, 3 passed

## Not executed
- Docker / MinIO
- Browser Playwright E2E (frontend still uses same signed-URL contract)

## Status
PASS (local disk + MySQL integration). Browser E2E later PASS (10/10). See `docs/releases/PHASE-04-COMPLETION.md`.
