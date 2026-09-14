# Preview API Contracts

**Feature**: File Preview UI
**Branch**: `002-file-preview-ui`

## Client-Side Preview API

No new backend routes. All preview functionality uses existing endpoints.

### Existing Endpoints Used

| Method | Path | Purpose |
| :--- | :--- | :--- |
| GET | `/files/:id/download` | Get signed download URL for current version |
| GET | `/files/:id` | Get file metadata (includes versions array) |
| GET | `/folders/:id` | Get folder contents (for navigation context) |

### Preview URL Contract

**Request**: `GET /files/:id/download`
- Auth: Bearer JWT (required)
- Success: 200 `{ download_url: string, expires_in_seconds: number, file_id: string }`
- Errors: 401, 404 (no read access), 403 (no read access but exists)

**Version-Specific Preview URL** (for version history):
- Uses same endpoint but with version-specific `s3Key` from `FileVersion` record
- Backend may need `GET /files/:id/versions/:versionNumber/download` — TBD in implementation

### Preview Metadata Contract

**File Detail Response** (from `GET /files/:id` or `GET /folders/:id`):
```typescript
interface FileRecord {
  id: string;
  name: string;
  folderId?: string | null;
  ownerName?: string | null;
  updatedAt?: string | null;
  size?: number | null;
  mimeType?: string | null;
  versions?: FileVersionRecord[];  // from file detail
}

interface FileVersionRecord {
  id: string;
  versionNumber: number;
  size: number;
  mimeType: string;
  sha256Hash: string;
  uploadedById: string;
  uploadedBy?: { email: string; name?: string };
}
```

### Client-Side Preview API Module

```typescript
// frontend/src/lib/api/preview.ts

export type PreviewFileInfo = {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  versionNumber?: number;
  s3Key?: string;  // for version-specific preview
};

export async function getPreviewUrl(fileId: string): Promise<{ download_url: string; expires_in_seconds: number }>;
export async function getVersionPreviewUrl(fileId: string, versionNumber: number): Promise<{ download_url: string; expires_in_seconds: number }>;
export function getPreviewMimeCategory(mimeType: string): 'pdf' | 'image' | 'video' | 'text' | 'unsupported';
export function getLanguageFromMime(mimeType: string, fileName: string): string;  // for syntax highlighting
```

### Error Handling

| Error | HTTP Status | Client Behavior |
| :--- | :--- | :--- |
| Unauthorized | 401 | Redirect to login / show auth error |
| Forbidden / Not Found | 403 / 404 | Show "File not found" (prevent enumeration) |
| Signed URL expired | 404/410 from storage | Auto-retry once, then show retry button |
| Network error | N/A | Show retry with exponential backoff |

### Security Notes

- All preview requests go through existing JWT guard + PermissionService
- `canRead` checked before signed URL issued (existing `FilesService.createDownloadUrl`)
- Cross-tenant requests return 404 (existing IDOR protection)
- No file paths or storage keys exposed to client except via signed URL
- Signed URLs short-lived (reuse existing TTL, typically 5-15 minutes)