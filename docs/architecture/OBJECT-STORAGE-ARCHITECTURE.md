# Object Storage Architecture

## Strategy
- S3-compatible storage (e.g., AWS S3, MinIO) for production deployments.
- **Local Windows dev (no Docker):** `STORAGE_DRIVER=local` writes bytes under `STORAGE_LOCAL_ROOT` with HMAC-signed `PUT/GET /storage/objects` URLs. See `docs/LOCAL-OBJECT-STORAGE.md`.
- **Tenant Isolation:** Single bucket per environment, isolated by prefix `tenant_{tenant_id}/`.
- **Object Key Strategy:** `tenant_{tenant_id}/files/{file_id}/{version_uuid}`.

## Upload Flow
1. Client requests upload URL.
2. Backend checks quotas and permissions, returns Signed URL.
3. Client uploads directly to S3.
4. Client notifies Backend of completion.
5. Backend verifies object exists, creates MySQL metadata records.

## Download Flow
1. Client requests download.
2. Backend checks read permissions.
3. Backend generates short-lived Signed URL for the specific version blob.
4. Client downloads directly from S3.

## Deletion
- Soft delete: Metadata marked as deleted. Blob remains.
- Hard delete (from trash): Backend removes blob via S3 API, then deletes metadata.
