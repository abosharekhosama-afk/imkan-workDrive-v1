# Implementation Plan: Version History UI

**Branch**: `003-version-history-ui` | **Date**: 2026-08-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-version-history-ui/spec.md`

## Summary

Add version history panel to browse, preview, and restore file versions in IMKAN One content region. Reuse File Preview UI (002) for version preview. Minimal backend — may need version-specific download endpoint. Respect Phase 05 ACL.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js 16 frontend, NestJS 11 backend)

**Primary Dependencies**: Next.js App Router, React 19, Tailwind CSS 4, existing i18n, File Preview UI (002), existing API client

**Storage**: MySQL 8.4.11 metadata; local disk object storage (`STORAGE_DRIVER=local`)

**Testing**: Jest unit (frontend); Playwright E2E. No Testcontainers. No Docker.

**Target Platform**: Windows 11 local services (MySQL84 Windows service, Node processes)

**Project Type**: Web application (Nest API + Next content region)

**Performance Goals**: History panel opens <300ms for files with <50 versions

**Constraints**: JWT `org_id` authoritative; no client `orgId`; 404 when `canRead` false; 403 when `canWrite` false for restore; constitution server-side auth; IMKAN One content region only; Docker forbidden

**Scale/Scope**: One feature slice: Version History panel + restore action. Reuses Preview UI.

## Constitution Check

| Principle | Status |
| :--- | :--- |
| I Repository source of truth | Pass |
| II Spec-driven | Pass |
| III Security by design | Pass — reuse ACL, signed URLs |
| IV Multi-tenancy | Pass — reuse JWT org |
| V MySQL 8.x | Pass — no schema changes |
| VI API contracts | Pass — minimal new endpoint |
| VII Server-side permissions | Pass |
| VIII IMKAN One | Pass |
| IX WorkDrive as reference | Pass |
| X Testing before completion | Pass |
| XI Documentation/evidence | Pass |
| XII Phase gates | Pass — Phase 05 PASS |
| XIII No fabricated completion | Pass |
| XIV Change control | Pass |
| XV Agent rules | Pass |

No constitution violations.

## Project Structure

### Documentation (this feature)

```text
specs/003-version-history-ui/
├── plan.md
├── research.md
├── spec.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── version-api.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root) — likely change set

```text
backend/src/files/
├── files.controller.ts           # Add GET /files/:id/versions/:versionNumber/download
├── files.service.ts              # Add getVersionDownloadUrl, restoreVersion
└── files.module.ts               # No change

frontend/src/components/
├── version-history-panel.tsx     # Main panel component
├── version-history/
│   ├── version-list.tsx          # Version list with metadata
│   ├── version-row.tsx           # Single version row (preview/restore buttons)
│   └── restore-confirm-modal.tsx # Confirmation modal
frontend/src/app/files/
├── [fileId]/
│   └── version-history/
│       └── page.tsx              # Version history route (optional)
frontend/src/lib/api/
├── versions.ts                   # Version history API client
└── preview.ts                    # Extend with getVersionPreviewUrl
frontend/src/i18n/messages/
├── en.json                       # Add version history keys
└── ar.json                       # Add version history keys (RTL)
frontend/e2e/
├── version-history.spec.ts       # Playwright tests
└── helpers/
    └── versions.ts               # Test helpers
```

**Structure Decision**: Extend existing monorepo. Backend: add version-specific download + restore endpoints. Frontend: new panel components, reuse PreviewModal/FilePreview from 002.

## Phase 0 Research

Completed in [research.md](./research.md). Verified: `FileVersion` model exists with all needed fields; `GET /files/:id` may already return versions; storage service can serve specific `s3Key`.

## Phase 1 Design

- [data-model.md](./data-model.md) — Version history panel state, version row data
- [contracts/version-api.md](./contracts/version-api.md) — Backend + frontend API contracts
- [quickstart.md](./quickstart.md) — Validation scenarios

## Implementation approach (for authorized implementers)

1. **Backend** (minimal):
   - Add `GET /files/:id/versions/:versionNumber/download` in `FilesController` → `FilesService.getVersionDownloadUrl` → returns signed URL for that version's `s3Key`
   - Add `POST /files/:id/restore-version` in `FilesController` → `FilesService.restoreVersion(versionNumber)` → creates new version copying source version's data, records audit `FILE_VERSION_RESTORED`
   - Ensure both respect `canRead`/`canWrite` via `PermissionService`

2. **Frontend API Client** (`frontend/src/lib/api/versions.ts`):
   - `getVersionHistory(fileId)` — from file detail (already includes versions)
   - `getVersionDownloadUrl(fileId, versionNumber)` — new endpoint
   - `restoreVersion(fileId, versionNumber)` — new endpoint

3. **Version History Components**:
   - `VersionHistoryPanel` — modal/side panel, opens from file row action menu
   - `VersionList` — virtualized list (if >50 versions), shows version#, uploader, date, size, hash
   - `VersionRow` — preview button (opens PreviewModal with version), restore button (if `canWrite`)
   - `RestoreConfirmModal` — confirms restore, shows source version info

4. **Integration**:
   - Add "Version History" action to `ActionDropdown` in `file-table.tsx`
   - Wire panel into `FileBrowser` state
   - Version preview: call `PreviewModal` with `FilePreview` + `versionNumber` prop
   - Restore: confirmation → API call → refresh file list + version history

5. **i18n**: Add keys for version history (EN/AR, RTL)

6. **Tests**: Unit for version list logic, restore confirmation; Playwright for history open, preview version, restore flow

7. **Regress**: Phase 05 suites + File Preview (002) suites

## Complexity Tracking

None.

## Phase Dependencies

- **Phase 05 complete**: REQUIRED
- **File Preview UI (002) complete or parallel**: Version preview reuses PreviewModal/FilePreview — CAN run in parallel but 002 must be done before 003 integration testing