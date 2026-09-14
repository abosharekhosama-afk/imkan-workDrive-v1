# Research: Version History UI

**Feature**: Version History UI
**Branch**: `003-version-history-ui`
**Date**: 2026-08-23

## Technology Choices

### Version List: Virtualized or Paginated
- **Decision**: Simple pagination (20 per page) for <100 versions; virtualized list (react-window) if >100
- **Rationale**: Most files have <20 versions; pagination simpler, no extra dependency for common case
- **Alternatives considered**:
  - react-window — good for large lists but adds dependency
  - Infinite scroll — harder for keyboard nav, no clear "end"

### Version Preview: Reuse File Preview (002)
- **Decision**: Pass `versionNumber` to existing `PreviewModal`/`FilePreview`
- **Rationale**: Zero duplication, consistent UX, all preview features available for old versions
- **Implementation**: `getVersionDownloadUrl(fileId, versionNumber)` returns signed URL for that version's `s3Key`

### Restore: New Version Record (Not Overwrite)
- **Decision**: Restore creates new version copying source version's storage data
- **Rationale**: Preserves history integrity, audit trail, allows re-restore
- **Implementation**: Transaction creates `FileVersion` with copied `s3Key`, `size`, `mimeType`, `sha256Hash`; new `versionNumber` = max + 1; `uploadedById` = current user

### Panel UI: Modal (Reuse Existing Modal)
- **Decision**: Use existing `Modal` component for version history panel
- **Rationale**: Consistent with share modal, delete modal, rename modal; focus trap, Escape close, ARIA dialog built-in
- **Alternative**: Side panel — more complex, not in existing component library

## Integration Points

### Backend (Minimal Changes)
- `FilesService.getVersionDownloadUrl(fileId, versionNumber)` → finds `FileVersion`, returns signed URL for its `s3Key`
- `FilesService.restoreVersion(fileId, versionNumber)` → transaction: copy source version data → new version → update file → audit log
- `FilesController` adds two endpoints (see contracts)

### Frontend API Client
- `versions.ts`: `getVersionDownloadUrl`, `restoreVersion`
- `preview.ts` (from 002): `getVersionPreviewUrl` alias

### Existing Components Reused
- `Modal` — version history panel wrapper
- `ActionDropdown` — "Version History" action on file row
- `PreviewModal` + `FilePreview` — version preview (with `versionNumber` prop)
- `Toast`/`AlertBanner` — restore success/error feedback
- `i18n` — EN/AR with RTL
- `Avatar`/`User` display — uploader name/email

### File Detail API
- Check if `GET /files/:id` already returns `versions[]` from Prisma `include: { versions: true }`
- If not, add to `FilesService.getById` / `FilesController.getById`

## Performance Considerations

### Version Count
- Typical: <20 versions per file
- Edge: 100+ versions → pagination/virtualization
- Metadata only (no content) in list — lightweight

### Preview of Old Versions
- Uses same signed URL mechanism as current version
- No additional storage access patterns

### Restore Operation
- Single DB transaction
- No blob copying (reuses existing `s3Key`)
- Audit log write

## Security Verification

### ACL Enforcement
- Version history: requires `canRead` on file (existing `PermissionService.canRead`)
- Preview version: requires `canRead` (same as current version preview)
- Restore: requires `canWrite` on file (existing `PermissionService.canWrite`)
- Cross-tenant: 404 (existing IDOR 18/18)
- Same-org non-member: 404 (existing Team Folder ACL 28/28)

### Data Integrity
- Restore never deletes/modifies existing versions
- New version has new `versionNumber` (monotonic increase)
- SHA256 hash preserved from source version
- Audit log captures `restoredFromVersion`

## Arabic RTL Support

### Existing Infrastructure
- `LocaleProvider` with `dir` attribute
- `label()` for localized strings
- Logical CSS properties

### Version History RTL
- Panel: header on right, close button on left
- Version list: version badge on right, metadata left-aligned in RTL
- Metadata: date/number formatting uses `Intl.DateTimeFormat(locale)`
- Restore modal: buttons reversed (confirm on left in RTL)
- Preview: delegates to File Preview (002) RTL handling

## Decisions Summary

| Area | Decision | Rationale |
| :--- | :--- | :--- |
| List rendering | Pagination (20/page) | Simple, no dep for common case |
| Version preview | Reuse 002 PreviewModal | Zero duplication, consistent UX |
| Restore behavior | New version record | History integrity, audit trail |
| Panel UI | Existing Modal | Consistency, built-in a11y |
| Backend endpoints | 2 new (download, restore) | Minimal, focused |
| Version data source | File detail `versions[]` | Already fetched |

## Open Questions (Resolved)

1. **Does `GET /files/:id` return versions?** Check backend — if not, add `include: { versions: { orderBy: { versionNumber: 'desc' } } }`
2. **Restore audit event**: Use new `FILE_VERSION_RESTORED` action type — extend existing audit logging
3. **Concurrent restores**: DB transaction with row lock on file — Prisma `$transaction` handles
4. **Large version counts**: Pagination with "Load more" button — added to tasks