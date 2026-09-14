# Version History API Contracts

**Feature**: Version History UI
**Branch**: `003-version-history-ui`

## Backend Endpoints (New)

### Get Version-Specific Download URL

**GET** `/files/:id/versions/:versionNumber/download`

**Purpose**: Get signed download URL for a specific file version (for preview/restore)

**Auth**: Bearer JWT (required)

**Path Parameters**:
- `id` (UUID): File ID
- `versionNumber` (integer): Version number to download

**Success Response** (200):
```json
{
  "download_url": "http://127.0.0.1:3001/storage/objects?token=...",
  "expires_in_seconds": 900,
  "file_id": "00000000-0000-4000-8000-000000000001",
  "version_number": 3
}
```

**Error Responses**:
| Status | Condition |
| :--- | :--- |
| 401 | Missing/invalid JWT |
| 403 | File exists but caller lacks `canRead` (cross-tenant or non-member) |
| 404 | File not found OR version not found OR caller lacks `canRead` (prevent enumeration) |

**Implementation Notes**:
- Reuse `FilesService.createDownloadUrl` logic but for specific `FileVersion.s3Key`
- Check `PermissionService.canRead(user, fileResource)` before issuing URL
- Storage service `createDownloadUrl` accepts `fileId`, `versionId`, `ownerOrgId`, `contentType`

### Restore Version

**POST** `/files/:id/restore-version`

**Purpose**: Restore a previous version as the new current version

**Auth**: Bearer JWT (required)

**Path Parameters**:
- `id` (UUID): File ID

**Request Body**:
```json
{
  "versionNumber": 3
}
```

**Success Response** (201):
```json
{
  "fileId": "00000000-0000-4000-8000-000000000001",
  "newVersionNumber": 6,
  "restoredFromVersion": 3
}
```

**Error Responses**:
| Status | Condition |
| :--- | :--- |
| 401 | Missing/invalid JWT |
| 403 | File exists but caller lacks `canWrite` |
| 404 | File not found OR caller lacks `canRead` |
| 400 | `versionNumber` invalid (not found, or is current version) |

**Implementation Notes**:
- Check `PermissionService.canWrite(user, fileResource)` before restore
- In transaction:
  1. Find source `FileVersion` by `fileId` and `versionNumber`
  2. Get current max `versionNumber` for file
  3. Create new `FileVersion` with:
     - `versionNumber` = max + 1
     - `s3Key`, `size`, `mimeType`, `sha256Hash` = copied from source
     - `uploadedById` = current user (`user.sub`)
  4. Update `File.updatedAt` = now()
  5. Create `AuditLog` with `action` = `FILE_VERSION_RESTORED`, `resourceId` = fileId, metadata JSON includes `restoredFromVersion`
- Return new version number

## Frontend API Client

**Module**: `frontend/src/lib/api/versions.ts`

```typescript
export type VersionRecord = {
  id: string;
  versionNumber: number;
  size: number;
  mimeType: string;
  sha256Hash: string;
  uploadedById: string;
  uploadedBy?: { email: string; name?: string | null };
};

export type RestoreVersionResponse = {
  fileId: string;
  newVersionNumber: number;
  restoredFromVersion: number;
};

export function getVersionDownloadUrl(fileId: string, versionNumber: number): Promise<{ download_url: string; expires_in_seconds: number; file_id: string; version_number: number }>;
export function restoreVersion(fileId: string, versionNumber: number): Promise<RestoreVersionResponse>;
```

**Usage**:
- Version list fetched from existing `GET /files/:id` (includes `versions[]`)
- Preview version: `getVersionDownloadUrl(fileId, versionNumber)` → pass to `PreviewModal` with `versionNumber`
- Restore: `restoreVersion(fileId, versionNumber)` → on success, refresh file detail + version history

## Security Notes

- All endpoints go through existing `JwtAuthGuard` + `TenantContextInterceptor`
- `PermissionService.canRead` / `canWrite` enforced before any storage access
- Cross-tenant: 404 (consistent with IDOR 18/18)
- Same-org non-member: 404 (consistent with Team Folder ACL 28/28)
- Signed URLs short-lived (reuse existing TTL, typically 900s)
- No version data exposed without `canRead` on parent file
- Restore creates new version — never modifies/deletes existing versions