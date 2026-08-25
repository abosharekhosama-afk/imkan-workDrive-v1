# Feature Specification: Version History UI

**Feature Branch**: `003-version-history-ui`

**Created**: 2026-08-23

**Status**: Draft

**Input**: User description: "Version History UI to browse, preview, and restore file versions in IMKAN WorkDrive content region"

## Problem Statement

Phase 04 implemented file versioning at the backend (`FileVersion` model with `versionNumber`, `s3Key`, `size`, `mimeType`, `sha256Hash`, `uploadedById`). Every upload creates a new version. However, no UI exists to browse version history, compare versions, preview a specific version, or restore a previous version. Users cannot recover from accidental overwrites or view document evolution.

## Goals

- Display version history timeline for any file (accessible via file row action menu)
- Preview any version inline using the File Preview UI (reuse preview component)
- Restore a previous version as the current version (creates new version record)
- Show metadata per version: version number, uploader, timestamp, file size, hash
- Respect existing ACL — `canRead` to view history, `canWrite` to restore
- Arabic RTL support via existing locale system
- No new backend routes — reuse existing version data from file detail API

## Non-Goals

- Visual diff/comparison between versions (text/image diff) — future phase
- Version naming/labeling (v1.0, release tags)
- Bulk version operations (delete multiple, export)
- Version retention policies/auto-cleanup
- Branching/merging versions
- Preview of versions for unsupported file types (reuse preview fallback)

## User Scenarios & Testing

### User Story 1 - View version history (Priority: P1)

A user opens the version history panel for a file. They see a chronological list of all versions with metadata.

**Acceptance Scenarios**:
1. **Given** a file with 5 versions, **When** user opens history, **Then** sees versions 5→1 (newest first) with uploader, date, size
2. **Given** user has `canRead` but not `canWrite`, **When** they open history, **Then** they can view but restore is disabled/hidden
3. **Given** user has no `canRead` (non-member), **When** they attempt history, **Then** 404 (existing ACL)
4. **Given** a file with single version, **When** history opened, **Then** shows only current version with "No previous versions" message

### User Story 2 - Preview a specific version (Priority: P1)

A user clicks a version in history. The preview opens showing that version's content.

**Acceptance Scenarios**:
1. **Given** version history open, **When** user clicks "Preview" on version 3, **Then** File Preview opens with version 3 content
2. **Given** preview open for version 3, **When** user clicks "Preview" on version 1, **Then** preview updates to version 1 without closing
3. **Given** preview of old version, **When** user closes preview, **Then** returns to version history panel (not file list)
4. **Given** preview of version 3 (PDF), **When** user navigates pages, **Then** works same as current version preview

### User Story 3 - Restore a previous version (Priority: P1)

A user restores version 2 as the current version. System creates version 6 (copy of version 2).

**Acceptance Scenarios**:
1. **Given** user with `canWrite` on file, **When** they click "Restore" on version 2, **Then** confirmation modal appears
2. **Given** user confirms, **Then** new version created (current + 1) with version 2's content, uploader = current user
3. **Given** restore complete, **Then** file list shows updated `updatedAt`, version count increased
4. **Given** user without `canWrite` (VIEWER), **When** they attempt restore, **Then** 403/forbidden
5. **Given** audit log, **When** restore happens, **Then** `FILE_VERSION_RESTORED` event recorded with source version

### User Story 4 - Version history accessibility and navigation (Priority: P2)

Version history panel is keyboard accessible and screen-reader friendly.

**Acceptance Scenarios**:
1. **Given** focus on file row, **When** user opens history via keyboard, **Then** panel opens with focus on close button
2. **Given** history panel open, **When** user presses Escape, **Then** panel closes, focus returns to file row
3. **Given** screen reader, **When** history opens, **Then** announces "Version history for [filename], 5 versions"
4. **Given** user tabs through versions, **Then** each version announces number, date, uploader, size

## Requirements

### Functional Requirements

- **FR-001**: System MUST display version history for any file accessible via `canRead`
- **FR-002**: Version history MUST show: version number, uploader name/email, upload timestamp, file size, SHA256 hash (truncated)
- **FR-003**: Versions MUST be ordered newest-first (current version at top)
- **FR-004**: User MUST be able to preview any version using File Preview UI (reuse component)
- **FR-005**: User with `canWrite` MUST be able to restore any previous version as new current version
- **FR-006**: Restore MUST create new version record (not overwrite), preserving history integrity
- **FR-007**: Restore MUST record audit event `FILE_VERSION_RESTORED` with actor, source version, new version
- **FR-008**: Version history MUST open in content region (modal or side panel) without page navigation
- **FR-009**: Version history MUST be fully localized (EN/AR) with RTL support
- **FR-010**: Version history MUST support keyboard navigation (Escape to close, Tab/Arrow keys within panel)
- **FR-011**: Version metadata MUST use existing file detail API (no new backend routes)
- **FR-012**: Preview of old version MUST use existing signed URL mechanism (version-specific download URL)

### Security Requirements

- **SR-001**: Version history access requires `canRead` on file (existing ACL)
- **SR-002**: Restore requires `canWrite` on file (existing ACL)
- **SR-003**: Cross-tenant version access returns 404 (consistent with IDOR)
- **SR-004**: Signed URLs for old versions MUST be short-lived (reuse existing TTL)
- **SR-005**: Restore MUST NOT allow deleting/altering existing version records

### Error / Status Semantics

| Situation | Behavior |
| :--- | :--- |
| Missing/invalid JWT | 401 |
| No `canRead` on file | 404 |
| No `canWrite` on restore | 403 |
| Version not found | 404 |
| Storage error fetching old version | Show retry, log error |

## Key Entities

- **File**: Existing entity, has many `FileVersion` records
- **FileVersion**: `id`, `fileId`, `versionNumber`, `s3Key`, `size`, `mimeType`, `sha256Hash`, `uploadedById`, `orgId`
- **Version History Panel**: Ephemeral client state showing versions for one file
- **Restore Action**: Creates new `FileVersion` copying `s3Key`, `size`, `mimeType`, `sha256Hash` from source version

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of files with versions show history panel when authorized
- **SC-002**: Preview of any version works for all supported MIME types (reuse File Preview)
- **SC-003**: Restore creates new version, increments version number, preserves all prior versions
- **SC-004**: Zero ACL bypass — existing IDOR (18/18) and Team Folder ACL (28/28) tests pass
- **SC-005**: Keyboard-only users can open history, preview versions, restore, and close
- **SC-006**: Arabic RTL renders correctly for history panel and metadata
- **SC-007**: No new backend routes — version data from existing `GET /folders/:id` or `GET /files/:id` detail

## Assumptions

- `GET /files/:id` or `GET /folders/:id` already returns `versions` array (check existing API)
- `FileVersion` model has all needed fields (`versionNumber`, `s3Key`, `size`, `mimeType`, `sha256Hash`, `uploadedById`)
- Storage service can generate signed URL for specific version via `s3Key`
- `uploadedBy` relation gives uploader name/email for display
- Restore implemented as: POST `/files/:id/restore-version` with `{ versionNumber }` body (or reuse upload-complete flow)
- Audit logging already captures `FILE_UPLOAD_COMPLETE` — extend for `FILE_VERSION_RESTORED`

## Risks

- Large version counts (100+) — implement pagination/virtualization
- Storage key for old version may be purged if blob cleanup runs — handle gracefully
- Concurrent restores — version number race condition (use DB transaction)

## Explicit Exclusions

- Visual diff between versions
- Version labeling/tags
- Bulk version delete
- Version retention policies
- Branching/merging

## Acceptance Criteria (feature)

1. Spec, plan, and tasks exist under `specs/003-version-history-ui/`
2. After implementation: version history panel opens, shows all versions, preview works, restore works, ACL enforced
3. No regression in Phase 04/05 tests

## Traceability

| This spec | Existing artifact | Resolution |
| :--- | :--- | :--- |
| FR-001 | Phase 04 FileVersion model | Expose via existing API |
| FR-004 | File Preview UI (002) | Reuse preview component |
| FR-005 | Phase 05 PermissionService | Reuse `canWrite` |
| FR-007 | Phase 04 Audit logging | Extend with restore event |

## Dependencies

- Phase 05 complete (Team Folder ACL, file APIs, audit)
- File Preview UI (002) implemented or parallel
- `FileVersion` model populated on upload (Phase 04)
- Storage service signed URL for specific version key

## Quickstart (after implementation)

```bash
# Backend: may need restore-version endpoint
cd backend && npm test

# Frontend unit tests
cd frontend && npm test

# E2E: version history flows
cd frontend && npx playwright test e2e/version-history.spec.ts
```