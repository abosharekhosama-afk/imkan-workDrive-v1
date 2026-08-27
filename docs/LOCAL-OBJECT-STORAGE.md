# Local Object Storage (Windows, no Docker)

## Current architecture

WorkDrive keeps **file metadata in MySQL** and **bytes outside MySQL** through the existing `StorageService` contract:

- `buildObjectKey` → `tenant_{orgId}/files/{fileId}/{versionUuid}`
- `createUploadUrl` / `createDownloadUrl` → short-lived signed URLs
- `assertObjectExists` → verifies bytes before `upload-complete`

Production target remains **S3-compatible** storage (`STORAGE_DRIVER=s3`). For local Windows development **without Docker or MinIO**, the default driver is **`local`**.

## Local disk adapter

| Setting | Purpose |
|--------|---------|
| `STORAGE_DRIVER=local` | Select filesystem-backed adapter (default) |
| `STORAGE_LOCAL_ROOT=.data/objects` | Root directory for tenant-prefixed blobs |
| `STORAGE_PUBLIC_BASE_URL=http://127.0.0.1:3001` | Base URL embedded in signed links |
| `STORAGE_SIGNING_SECRET` | HMAC secret for object tokens (falls back to `JWT_SECRET`) |
| `S3_SIGNED_URL_EXPIRES_SECONDS=900` | Token TTL (shared with S3 driver) |

### Flow

1. Authenticated API creates metadata in MySQL and returns a signed **PUT** URL: `PUT /storage/objects?token=…`
2. Client uploads bytes directly to that URL (browser `fetch` PUT from the frontend upload helper).
3. `POST /files/upload-complete` calls `assertObjectExists` (filesystem `access`).
4. Download and public share verification return signed **GET** URLs to the same `/storage/objects` endpoint.

Tenant isolation is unchanged:

- Object keys always include the server tenant id from JWT / ALS.
- Signed tokens bind method (`PUT`/`GET`), object key, and expiry.
- Path traversal is blocked when resolving disk paths.

## S3 driver (optional, not required locally)

Set `STORAGE_DRIVER=s3` and configure `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` when a real S3-compatible endpoint is available. No Docker is required if you have a native or hosted endpoint.

## Setup (Windows)

1. Ensure MySQL `workdrive_dev` is migrated and seeded (see backend README).
2. In `backend/.env`:

```env
STORAGE_DRIVER=local
STORAGE_LOCAL_ROOT=.data/objects
STORAGE_PUBLIC_BASE_URL=http://127.0.0.1:3001
```

3. Start the API: `npm run start` from `backend/`.
4. Blobs appear under `.data/objects/tenant_{orgId}/files/{fileId}/{versionId}` (gitignored).

## Tests

- Unit: `object-access-token.spec.ts`, `local-disk.storage.spec.ts`
- Integration (real MySQL + local disk): `test/storage.integration.e2e-spec.ts`

Run:

```powershell
cd backend
npx nest build
npx jest --runInBand --testPathPatterns="object-access-token|local-disk.storage|object-key"
npm run test:e2e -- --testPathPatterns=storage.integration
```

## Deletion semantics

- **Trash (soft delete):** MySQL `files.deleted_at` only; blobs remain on disk.
- **Hard delete from trash:** not implemented in Phase 04; blobs are retained until a future purge job.

## Related docs

- `docs/architecture/OBJECT-STORAGE-ARCHITECTURE.md` — product flow
- `docs/changes/CHANGE-T405.md` — implementation record
