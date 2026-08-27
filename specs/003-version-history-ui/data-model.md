# Data Model: Version History UI

**Feature**: Version History UI
**Branch**: `003-version-history-ui`

## Entities

### Existing Entities Used

| Entity | Source | Fields Used |
| :--- | :--- | :--- |
| File | Phase 04 `File` model | `id`, `name`, `mimeType`, `size`, `versions[]` |
| FileVersion | Phase 04 `FileVersion` model | `id`, `versionNumber`, `s3Key`, `size`, `mimeType`, `sha256Hash`, `uploadedById`, `uploadedBy` (relation) |
| User | Phase 04 `User` model | `id`, `email`, `name` (for uploader display) |
| AuditLog | Phase 04 `AuditLog` model | `action` = `FILE_VERSION_RESTORED`, `resourceId` = fileId, `resourceType` = `FILE` |

## Version History Panel State (Client Only)

```typescript
type VersionHistoryState = {
  fileId: string;
  fileName: string;
  mimeType: string;
  currentVersionNumber: number;
  versions: VersionRowData[];
  selectedVersion?: VersionRowData;  // for preview
  isLoading: boolean;
  error: string | null;
  restoreConfirmOpen: boolean;
  restoreTargetVersion?: number;
};

type VersionRowData = {
  versionNumber: number;
  size: number;
  mimeType: string;
  sha256Hash: string;      // truncated for display (first 16 chars)
  uploadedAt: string;      // ISO timestamp
  uploader: {
    id: string;
    email: string;
    name?: string | null;
  };
  isCurrent: boolean;
  canPreview: boolean;     // always true if canRead
  canRestore: boolean;     // true if canWrite && !isCurrent
};
```

## API Contracts (Frontend ↔ Backend)

### Get Version History (from existing file detail)

`GET /files/:id` or `GET /folders/:id` (when file in folder detail)
```typescript
// Response includes:
{
  file: { ..., versions: FileVersionRecord[] }
}
```

### Get Version-Specific Download URL

**NEW ENDPOINT**: `GET /files/:id/versions/:versionNumber/download`
- Auth: Bearer JWT
- Success: 200 `{ download_url: string, expires_in_seconds: number, file_id: string, version_number: number }`
- Errors: 401, 404 (no read access or version not found), 403 (no read access)

### Restore Version

**NEW ENDPOINT**: `POST /files/:id/restore-version`
- Auth: Bearer JWT
- Body: `{ versionNumber: number }`
- Success: 201 `{ fileId: string, newVersionNumber: number, restoredFromVersion: number }`
- Errors: 401, 403 (no write access), 404 (file/version not found), 400 (invalid version number)

## Version Row Display Rules

| Field | Format |
| :--- | :--- |
| Version Number | `v{N}` (e.g., `v5`, `v1`) |
| Upload Date | Localized: `Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })` |
| Size | Human readable: `1.2 MB`, `45 KB`, etc. |
| Hash | First 16 chars + `…` (e.g., `a1b2c3d4e5f67890…`) |
| Uploader | `{name} ({email})` or just email if no name |
| Current Badge | "Current" label on latest version |

## Validation Rules

- Version history only fetched after `canRead` verified on file
- Restore button only enabled if `canWrite` on file AND version is not current
- Restore creates new version: `newVersionNumber = currentVersionNumber + 1`
- Restore copies: `s3Key`, `size`, `mimeType`, `sha256Hash` from source version
- Restore sets: `uploadedById` = current user, `versionNumber` = new version number
- Audit log: `FILE_VERSION_RESTORED` with `actorId` = current user, `resourceId` = fileId, metadata includes `restoredFromVersion`

## State Transitions

```text
Closed → Loading (fetch file detail with versions) → Ready (list rendered)
Ready → Previewing (open PreviewModal with versionNumber)
Previewing → Ready (close preview)
Ready → RestoreConfirm (click restore on version)
RestoreConfirm → Restoring (POST restore-version)
Restoring → Ready (success: refresh versions, show toast)
Restoring → RestoreConfirm (error: show error, keep modal open)
Ready → Closed (Escape / close / backdrop)
```

## Relationships

- VersionHistoryPanel → File (1:1, ephemeral)
- VersionHistoryPanel → FileVersion[] (1:many, from file detail)
- VersionRow → PreviewModal (1:1, opens FilePreview with versionNumber)
- VersionRow → RestoreConfirmModal (1:1, on restore click)
- Restore Action → FileVersion (creates new record)
- Restore Action → AuditLog (creates FILE_VERSION_RESTORED entry)