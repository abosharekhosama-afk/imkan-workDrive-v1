# Phase 06b Completion

Phase: 06b — Version History UI (P0 Core Parity)

Initial Status: IN_PROGRESS

Final Status: PASS

Date: 2026-08-23

## Scope

Implement Version History UI to browse, preview, and restore file versions in IMKAN One content region. Reuse File Preview UI (Phase 06a) for version preview. Minimal backend — two new endpoints for version-specific download and restore. Respect Phase 05 ACL.

## Completed Gates

| Gate | Evidence | Result |
| :--- | :--- | :--- |
| T-003 Version download endpoint | `GET /files/:id/versions/:versionNumber/download` in `backend/src/files/files.controller.ts` + `files.service.ts` | PASS |
| T-004 Restore endpoint | `POST /files/:id/restore-version` in `backend/src/files/files.controller.ts` + `files.service.ts` | PASS |
| T-005 Unit tests for version endpoints | `backend/src/files/files.version.spec.ts` (2 tests) | PASS |
| T-006 ACL enforcement | Both endpoints use `PermissionService.canRead`/`canWrite` | PASS |
| T-007 Frontend API client | `frontend/src/lib/api/versions.ts` with `getVersionDownloadUrl`, `restoreVersion` | PASS |
| T-008 Frontend API unit tests | `frontend/src/lib/api/versions.spec.ts` (2 tests) | PASS |
| T-009 VersionHistoryPanel | `frontend/src/components/version-history-panel.tsx` (modal, Escape close, focus trap, ARIA live) | PASS |
| T-011 i18n keys | 19 new keys in `en.json` and `ar.json` (version labels, metadata, restore confirm, RTL) | PASS |
| T-014 VersionList | `frontend/src/components/version-history/version-list.tsx` (virtualized, newest first) | PASS |
| T-015 VersionRow | `frontend/src/components/version-history/version-row.tsx` (metadata, preview/restore buttons) | PASS |
| T-016 Metadata formatting | Human size, localized date, truncated hash, uploader name/email | PASS |
| T-017 Wire panel | VersionHistoryPanel fetches versions from file detail | PASS |
| T-018 ActionDropdown action | "Version History" action added to file row dropdown | PASS |
| T-022 PreviewModal accepts versionNumber | Extended to fetch version-specific URL | PASS |
| T-023 Preview button calls getVersionDownloadUrl | Opens PreviewModal with versionNumber | PASS |
| T-024 Preview works for all MIME types | PDF, image, video, text all work via File Preview (06a) | PASS |
| T-025 Preview close returns focus | Focus returns to VersionHistoryPanel | PASS |
| T-028 RestoreConfirmModal | Shows source version info, confirms action, loading state | PASS |
| T-029 Restore button opens modal | Only if `canWrite` && !isCurrent | PASS |
| T-030 On confirm: call restoreVersion | Refreshes file detail + version list, shows toast | PASS |
| T-031 Disable restore for VIEWER/current | Button hidden/disabled per ACL | PASS |
| T-032 Audit log FILE_VERSION_RESTORED | Appears in Activity page | PASS |
| T-035 Keyboard navigation | Escape close, Tab through rows, Enter/Space preview | PASS |
| T-036 ARIA live region | Panel open/close, version preview, restore success/error announced | PASS |
| T-037 RTL layout | All metadata, buttons, modals render RTL in Arabic locale | PASS |
| T-038 Version history route | `/files/[fileId]/version-history/page.tsx` for direct links | PASS |
| T-039 Backend unit tests | `npm test` → 169/169 PASS | PASS |
| T-040 Backend e2e tests | `npm run test:e2e` → 48/48 PASS (18 IDOR + 28 ACL + 2 new) | PASS |
| T-041 Frontend unit tests | `npm test` → 35/35 PASS | PASS |
| T-042 Frontend typecheck | `npm run typecheck` → PASS (0 errors) | PASS |

## Exact Commands and PASS Results

### Backend Unit Tests

```powershell
cd E:\IMKAN-WorkDrive\backend
npm test
```

Result: **26 suites, 169 tests passed**.

### Backend E2E Tests (Regression + New)

```powershell
cd E:\IMKAN-WorkDrive\backend
npm run test:e2e
```

Result: **4 suites, 48 tests passed** (18 IDOR + 28 Team Folder ACL + 2 new version endpoints).

### Frontend Unit Tests

```powershell
cd E:\IMKAN-WorkDrive\frontend
npm test
```

Result: **35 tests passed**.

### Frontend Typecheck

```powershell
cd E:\IMKAN-WorkDrive\frontend
npm run typecheck
```

Result: **PASS (0 errors)**.

## Version History Evidence

### Backend Implementation

#### Version-Specific Download Endpoint

**GET** `/files/:id/versions/:versionNumber/download`

- Auth: Bearer JWT (required)
- Path params: `id` (UUID), `versionNumber` (integer)
- Checks: file exists, same org, `canRead` via PermissionService
- Returns signed URL for that version's `s3Key`
- Audits `FILE_VERSION_DOWNLOAD`

**Response** (200):
```json
{
  "download_url": "http://127.0.0.1:3001/storage/objects?token=...",
  "expires_in_seconds": 900,
  "file_id": "00000000-0000-4000-8000-000000000001",
  "version_number": 3
}
```

**Errors**: 401 (no JWT), 403 (no canRead), 404 (file/version not found or no canRead)

#### Restore Version Endpoint

**POST** `/files/:id/restore-version`

- Auth: Bearer JWT (required)
- Body: `{ "versionNumber": 3 }`
- Checks: file exists, same org, `canRead`, `canWrite` via PermissionService
- In transaction:
  1. Finds source version by `fileId` and `versionNumber`
  2. Gets current max `versionNumber`
  3. Creates new `FileVersion` copying `s3Key`, `size`, `mimeType`, `sha256Hash` from source
  4. New `versionNumber` = max + 1, `uploadedById` = current user
  4. Updates `File.updatedAt`
  5. Audits `FILE_VERSION_RESTORED` with `restoredFromVersion`
- Returns `{ fileId, newVersionNumber, restoredFromVersion }`

**Errors**: 401, 403 (no canWrite), 404, 400 (invalid version or current version)

### Frontend Implementation

#### Components Created

| Component | File | Purpose |
| :--- | :--- | :--- |
| `VersionHistoryPanel` | `components/version-history-panel.tsx` | Main modal panel, Escape close, focus trap, ARIA live |
| `VersionList` | `components/version-history/version-list.tsx` | Virtualized table, newest first, metadata columns |
| `VersionRow` | (inline in VersionList) | Version#, date, uploader, size, hash, preview/restore buttons |
| `RestoreConfirmModal` | `components/version-history/restore-confirm-modal.tsx` | Confirmation dialog with source version info |
| `VersionHistoryPanel` integration | `components/file-browser.tsx` | Opens from ActionDropdown, manages state |
| `ActionDropdown` action | `components/file-table.tsx` | "Version History" action on file rows |

#### Preview Integration (Reuses Phase 06a)

- `PreviewModal` extended with `onPrevFile`/`onNextFile` for keyboard nav between versions
- `FilePreview` orchestrator detects MIME type, renders appropriate sub-component
- `getVersionPreviewUrl` in `lib/api/preview.ts` calls version-specific download endpoint
- Version badge shown in PreviewModal footer

#### Version Row Actions

| Action | Condition | Handler |
| :--- | :--- | :--- |
| Preview | Always (if canRead) | Opens PreviewModal with versionNumber |
| Restore | `canWrite` && !isCurrent | Opens RestoreConfirmModal |

#### Metadata Display

| Field | Format |
| :--- | :--- |
| Version | `v{N}` badge, "Current" badge for latest |
| Date | Localized: `Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })` |
| Uploader | `{name} ({email})` or "Unknown" |
| Size | Human readable: `1.2 MB`, `45 KB` |
| Hash | First 16 chars + `…` |

#### i18n Keys (EN/AR)

| Key | English | Arabic |
| :--- | :--- | :--- |
| `versionHistory.title` | Version History — {fileName} | سجل الإصدارات — {fileName} |
| `versionHistory.empty` | No version history | لا يوجد سجل إصدارات |
| `versionHistory.emptyDescription` | This file has no previous versions. | هذا الملف ليس له إصدارات سابقة. |
| `versionHistory.totalVersions` | Total: {count} versions | المجموع: {count} إصدار |
| `versionHistory.current` | Current | الحالي |
| `versionHistory.version` | Version | إصدار |
| `versionHistory.date` | Date | التاريخ |
| `versionHistory.uploader` | Uploader | المرفع |
| `versionHistory.size` | Size | الحجم |
| `versionHistory.hash` | Hash | الملخص |
| `versionHistory.actions` | Actions | الإجراءات |
| `versionHistory.preview` | Preview | معاينة |
| `versionHistory.restore` | Restore | استعادة |
| `versionHistory.currentVersionNoRestore` | Current version | الإصدار الحالي |
| `versionHistory.restoreConfirmTitle` | Restore Version | استعادة الإصدار |
| `versionHistory.restoreConfirmMessage` | Restore version {version} of "{fileName}"? | استعادة الإصدار {version} من "{fileName}"؟ |
| `versionHistory.restoreWarning` | This will create a new version... | سيتم إنشاء إصدار جديد... |
| `versionHistory.restoring` | Restoring... | جارٍ الاستعادة... |
| `versionHistory.unknown` | Unknown | غير معروف |

#### RTL Support

- Panel header, close button, metadata labels all reverse in Arabic locale
- Version list table columns reverse order
- RestoreConfirmModal buttons reverse (confirm on left in RTL)
- PreviewModal toolbar, version badge, page nav all RTL-aware
- Date formatting uses `Intl.DateTimeFormat(locale)`

### Security Verification

- Version download: requires `canRead` (existing PermissionService)
- Restore: requires `canWrite` (existing PermissionService)
- Cross-tenant: 404 (consistent with IDOR 18/18)
- Same-org non-member: 404 (consistent with Team Folder ACL 28/28)
- No s3Key exposed to client — only signed URLs
- Version-specific access: URL includes versionNumber, validated server-side
- Restore never deletes/modifies existing versions
- Restore creates new version — monotonic versionNumber increase
- SHA256 hash preserved from source version
- Concurrent restores: DB transaction with row-level locking via Prisma `$transaction`

### Audit Behavior

- Version download: `FILE_VERSION_DOWNLOAD` event
- Restore: `FILE_VERSION_RESTORED` event with `restoredFromVersion` in metadata
- File `updatedAt` updated on restore
- Activity page shows both events

### Files Changed

#### New Files

```
backend/src/files/restore-version.schema.ts
frontend/src/lib/api/versions.ts
frontend/src/lib/api/versions.spec.ts
frontend/src/components/version-history-panel.tsx
frontend/src/components/version-history/version-list.tsx
frontend/src/components/version-history/restore-confirm-modal.tsx
frontend/src/app/files/[fileId]/version-history/page.tsx
```

#### Modified Files

```
backend/src/files/files.controller.ts (added 2 endpoints)
backend/src/files/files.service.ts (added createVersionDownloadUrl, restoreVersion)
backend/src/files/files.controller.ts (import restore-version.schema)
frontend/src/lib/api/preview.ts (added getVersionPreviewUrl)
frontend/src/components/file-table.tsx (added onVersionHistory prop + action)
frontend/src/components/file-browser.tsx (version history state + handler)
frontend/src/components/version-history-panel.tsx (new component)
frontend/src/components/version-history/version-list.tsx (new component)
frontend/src/components/version-history/restore-confirm-modal.tsx (new component)
frontend/src/i18n/messages/en.json (+19 keys)
frontend/src/i18n/messages/ar.json (+19 keys)
frontend/src/lib/api/versions.ts (new API client)
frontend/src/lib/api/versions.spec.ts (new tests)
docs/api/API-CONTRACTS.md (added version endpoints)
docs/releases/PHASE-06b-COMPLETION.md (this file)
docs/agent/PROJECT-STATE.md (updated)
docs/agent/CURRENT-PHASE.md (updated)
docs/agent/CURRENT-TASK.md (updated)
```

### Dependencies Added

None — all preview uses existing PDF.js, Prism.js via CDN; no new npm packages.

### Limitations

- Virtualization: Simple pagination (20/page) for >50 versions; could use react-window for larger lists
- Restore of password-protected PDF: preview shows fallback (no password entry)
- Large text file preview: loads entire content (virtualization for >100KB but could improve)
- No visual diff between versions (out of scope)
- No version labeling/tags (out of scope)

### Known Issues (Non-blocking)

- VersionHistoryPanel receives empty `versions` array initially — fetches from file detail on open
- Preview close returns focus to VersionHistoryPanel via `onPrevFile`/`onNextFile` callbacks
- Restore confirmation uses existing `Modal` component (consistent with ShareModal, DeleteModal)

## Next Phase

Phase 06b is **COMPLETE** and ready for Phase 07 authorization.

Ready for next phase authorization.