---
description: "Task list for Version History UI (P0 Core Parity)"
---

# Tasks: Version History UI

**Input**: Design documents from `specs/003-version-history-ui/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Status**: Ready for implementation **only after explicit user authorization**.

**Tests**: Required (user-facing feature). Write failing tests before or with matching production change.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3 / US4 from spec.md

---

## Phase 1: Setup

**Purpose**: Confirm baseline; no production changes yet

- [ ] T001 Read `docs/releases/PHASE-05-COMPLETION.md`, `docs/releases/PHASE-06a-COMPLETION.md` (File Preview), and `specs/003-version-history-ui/spec.md`; confirm Docker/MinIO not started
- [ ] T002 [P] Confirm existing regression gates pass: IDOR 18/18, Team Folder ACL 28/28, File Preview E2E, Playwright 11/11

---

## Phase 2: Foundational (blocks all stories)

**Purpose**: Backend version endpoints + frontend API client + version history panel shell

### Backend (minimal)

- [ ] T003 Add `GET /files/:id/versions/:versionNumber/download` in `backend/src/files/files.controller.ts` and `files.service.ts` — returns signed URL for version's `s3Key`
- [ ] T004 Add `POST /files/:id/restore-version` in `backend/src/files/files.controller.ts` and `files.service.ts` — creates new version copying source, audit `FILE_VERSION_RESTORED`
- [ ] T005 [P] Add unit tests for version download/restore in `backend/src/files/files.version.spec.ts`
- [ ] T006 Ensure both endpoints enforce `canRead`/`canWrite` via `PermissionService`

### Frontend API & Panel Shell

- [ ] T007 Add version API client in `frontend/src/lib/api/versions.ts`: `getVersionDownloadUrl`, `restoreVersion`
- [ ] T008 [P] Add unit tests for version API client in `frontend/src/lib/api/versions.spec.ts`
- [ ] T009 Create `VersionHistoryPanel` component in `frontend/src/components/version-history-panel.tsx` (modal/side panel, Escape close, focus trap)
- [ ] T010 [P] Add `VersionHistoryPanel` accessibility tests in `frontend/src/components/version-history-panel.spec.ts`
- [ ] T011 Add i18n keys for version history in `frontend/src/i18n/messages/en.json` and `ar.json` (version labels, metadata, restore confirm, RTL)

**Checkpoint**: Backend endpoints return signed URLs for versions; panel opens/closes; i18n keys present

---

## Phase 3: User Story 1 - View Version History (Priority: P1)

**Goal**: Display version list with metadata

### Tests for User Story 1

- [ ] T012 [US1] Add Playwright test `e2e/version-history.spec.ts` for: open history, list renders, metadata correct, keyboard nav
- [ ] T013 [P] [US1] Add unit test for version list sorting (newest first), metadata formatting

### Implementation for User Story 1

- [ ] T014 [US1] Create `VersionList` component in `frontend/src/components/version-history/version-list.tsx` (virtualized if >50)
- [ ] T015 [US1] Create `VersionRow` component in `frontend/src/components/version-history/version-row.tsx` — shows version#, date, uploader, size, hash, preview/restore buttons
- [ ] T016 [US1] Implement metadata formatting: human size, localized date, truncated hash, uploader name/email
- [ ] T017 [US1] Wire `VersionList` into `VersionHistoryPanel`; fetch versions from file detail (already in `FileDetail`)
- [ ] T018 [US1] Add "Version History" action to `ActionDropdown` in `frontend/src/components/file-table.tsx`
- [ ] T019 [US1] Wire panel open/close into `FileBrowser` state

**Checkpoint**: Version history panel opens from file row, shows all versions with correct metadata

---

## Phase 4: User Story 2 - Preview Version (Priority: P1)

**Goal**: Preview any version using File Preview UI (002)

### Tests for User Story 2

- [ ] T020 [US2] Add Playwright test: preview version 3, verify content differs from current, close preview returns to history
- [ ] T021 [P] [US2] Add unit test for version preview URL generation

### Implementation for User Story 2

- [ ] T022 [US2] Extend `PreviewModal` / `FilePreview` (from 002) to accept `versionNumber` prop
- [ ] T023 [US2] In `VersionRow`, "Preview" button calls `getVersionDownloadUrl` → opens `PreviewModal` with `versionNumber`
- [ ] T024 [US2] Ensure preview of old version works for all MIME types (PDF, image, video, text)
- [ ] T025 [US2] Preview close returns focus to `VersionHistoryPanel` (not file browser)

**Checkpoint**: Any version previewable inline with full preview controls

---

## Phase 5: User Story 3 - Restore Version (Priority: P1)

**Goal**: Restore previous version as new current version

### Tests for User Story 3

- [ ] T026 [US3] Add Playwright test: restore version 2 → confirm modal → new version created → version list updated → audit log
- [ ] T027 [P] [US3] Add unit test for restore confirmation logic, version number increment

### Implementation for User Story 3

- [ ] T028 [US3] Create `RestoreConfirmModal` in `frontend/src/components/version-history/restore-confirm-modal.tsx` — shows source version info, confirms action
- [ ] T029 [US3] In `VersionRow`, "Restore" button (only if `canWrite` && !isCurrent) opens `RestoreConfirmModal`
- [ ] T030 [US3] On confirm: call `restoreVersion(fileId, versionNumber)` → on success, refresh file detail + version list, show toast
- [ ] T031 [US3] Disable restore button for VIEWER (no `canWrite`) and for current version
- [ ] T032 [US3] Ensure audit log `FILE_VERSION_RESTORED` appears in Activity page

**Checkpoint**: Restore creates new version, preserves history, audit logged, UI updates

---

## Phase 6: User Story 4 - Integration & Accessibility (Priority: P2)

**Goal**: Full integration, keyboard nav, screen reader, RTL

### Tests for User Story 4

- [ ] T033 [US4] Add Playwright tests: Escape closes panel, Tab/Arrow nav, screen reader announcements, RTL layout
- [ ] T034 [P] [US4] Add unit test for keyboard navigation logic

### Implementation for User Story 4

- [ ] T035 [US4] Implement keyboard navigation in `VersionHistoryPanel`: Escape close, Tab through rows, Enter/Space preview, Shift+Enter restore
- [ ] T036 [US4] Add ARIA live region for panel open/close, version preview, restore success/error
- [ ] T037 [US4] Ensure all version metadata, buttons, modals render RTL in Arabic locale
- [ ] T038 [US4] Add version history route `/files/[fileId]/version-history` in `frontend/src/app/files/[fileId]/version-history/page.tsx` (optional, for direct links)

**Checkpoint**: Panel fully accessible, keyboard navigable, RTL correct

---

## Phase 7: Polish, Regression, Docs

- [ ] T039 Run backend unit tests: `cd backend && npm test` (169+ pass)
- [ ] T040 Run backend e2e: `cd backend && npm run test:e2e` (48+ pass: 18 IDOR + 28 ACL + version endpoints)
- [ ] T041 Run frontend unit tests: `cd frontend && npm test` (26+ pass)
- [ ] T042 Run frontend typecheck: `cd frontend && npm run typecheck`
- [ ] T043 Run browser gate: `cd frontend && npm run test:e2e:browser:gate` (11+ pass)
- [ ] T044 [P] Update `docs/api/API-CONTRACTS.md` with version endpoints
- [ ] T045 [P] Record Phase 06b implementation evidence under `docs/releases/PHASE-06b-COMPLETION.md`
- [ ] T046 [P] Follow `specs/003-version-history-ui/quickstart.md` as operator checklist

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No code changes
- **Foundational (Phase 2)**: Blocks all user stories
- **US1 (Phase 3)**: After Phase 2
- **US2 (Phase 4)**: After US1 (needs VersionRow) + File Preview (002) done
- **US3 (Phase 5)**: After US1 (needs VersionRow)
- **US4 (Phase 6)**: After US1-US3
- **Polish (Phase 7)**: After all stories

### User Story Dependencies

- **US1 (View History)**: After Phase 2
- **US2 (Preview Version)**: After US1 + File Preview (002) complete
- **US3 (Restore)**: After US1
- **US4 (Integration)**: After US1-US3

### Parallel Opportunities

- T005 with T003-T004, T010 with T009, T013 with T012, T021 with T020, T027 with T026, T034 with T033
- US2 and US3 can run in parallel after US1 (different buttons on VersionRow)
- T039-T043 regression runs in parallel after all implementation

---

## Parallel Example: User Story 1

```text
T012 Playwright version list test (failing)
T013 Unit test for version formatting
then T014-T019 implementation
then T012 passes
```

---

## Implementation Strategy

### MVP (US1 + US2 + US3)

1. Phase 2 Foundational (backend endpoints + panel shell)
2. US1 Version List (core UI)
3. US2 Preview Version (reuse 002 PreviewModal)
4. US3 Restore Version (backend + confirm modal)
5. Stop and validate each

### Full P0 Core Parity

1. MVP complete
2. US4 Integration + Accessibility + RTL
3. Phase 7 regression + docs

---

## Notes

- **Backend**: Only 2 new endpoints needed (`GET version download`, `POST restore-version`). Reuse existing `FilesService` patterns.
- **File detail API**: Check if `GET /files/:id` already returns `versions[]`. If not, add to `FilesService.getById` or `FilesController.getById`.
- **Storage**: `StorageService.createDownloadUrl` already accepts `versionId` — use version's `s3Key` directly.
- **Preview integration**: `PreviewModal` from 002 must accept optional `versionNumber` to fetch version-specific URL.
- **Virtualization**: If version count > 50, use `react-window` or simple pagination (load 20 at a time).
- **Audit log**: `FILE_VERSION_RESTORED` — extend existing audit logging in `FilesService`.
- **No Docker/MinIO**: `STORAGE_DRIVER=local` verified.
- **Reuse**: `Modal`, `ActionDropdown`, `AlertBanner`, `Toast`, i18n system all from existing codebase.