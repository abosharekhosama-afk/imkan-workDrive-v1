---
description: "Task list for Team Folders intra-org ACL (Phase 05)"
---

# Tasks: Team Folders and Intra-Organization Authorization

**Input**: Design documents from `specs/001-team-folders-acl/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Status**: Ready for implementation **only after explicit user authorization**. Do not start these tasks during discovery.

**Tests**: Required (security feature). Write failing tests before or with the matching production change; do not claim PASS without execution.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3 from spec.md

## Phase 1: Setup

**Purpose**: Confirm baseline; do not change production behavior yet

- [x] T001 Read `docs/releases/PHASE-04-COMPLETION.md` and `specs/001-team-folders-acl/spec.md`; confirm Docker/MinIO will not be started and `STORAGE_DRIVER=local` stays
- [ ] T002 [P] Confirm existing suites are still the regression gates: `backend/test/idor.live.integration.e2e-spec.ts` and `frontend/e2e/workdrive-flow.spec.ts` (do not re-run unless later implementation changes code)

---

## Phase 2: Foundational (blocks all stories)

**Purpose**: PermissionService becomes the single ACL authority for personal vs Team Folder resources

**⚠️ CRITICAL**: No Team Folder HTTP or UI work until T003–T007 complete

- [x] T003 Expand resource type and implement `canRead`, `canWrite`, `canShare` (and manage-members / manage-TF helpers) in `backend/src/permissions/permission.service.ts` using JWT `org_id`, org ADMIN, personal Phase 04 rules, and `TeamFolderMember` lookup (inject Prisma or a membership port; update `backend/src/permissions/permissions.module.ts`)
- [x] T004 Rewrite `backend/src/permissions/permission.service.spec.ts` for the full matrix: org ADMIN, TF ADMIN, ORGANIZER, EDITOR, VIEWER, non-member, cross-tenant, personal owner MEMBER, JWT `role: VIEWER` personal deny, `isPublicToOrg` ignored
- [x] T005 Run `backend` unit tests for `permission.service.spec.ts` until they pass without changing folder/file/share production behavior yet (adapter/call-site updates may compile-fail until T006)
- [x] T006 Update call signatures in `backend/src/folders/folders.service.ts`, `backend/src/files/files.service.ts`, and `backend/src/shares/shares.service.ts` so existing `canWrite`/`canShare` still compile (pass `teamFolderId` when known; keep Phase 04 personal outcomes)
- [x] T007 [P] Adjust `backend/src/folders/folders.service.spec.ts`, `backend/src/files/files.service.spec.ts`, `backend/src/files/files.trash-restore.spec.ts`, and `backend/src/shares/shares.service.spec.ts` mocks for async PermissionService if needed; keep personal-folder expectations

**Checkpoint**: PermissionService encodes the matrix; personal tests still match Phase 04

---

## Phase 3: User Story 1 - Team Folder existence + default DENY (Priority: P1) 🎯 MVP

**Goal**: Org ADMIN can create a Team Folder; same-org non-members cannot see or touch it; inheritance and search/download/upload respect DENY

**Independent Test**: Live HTTP with minted JWTs — admin creates TF + file; non-member 404s; search empty

### Tests for User Story 1

- [x] T008 [US1] Add `backend/test/team-folder-acl.live.integration.e2e-spec.ts` with failing cases: non-member list/get TF, list children, download, upload, rename, trash/restore, create share, search name leak (mint JWT like IDOR suite; no Docker)
- [x] T009 [P] [US1] Add unit tests that `POST /folders` cannot attach a foreign or unreadable `teamFolderId` in `backend/src/folders/create-folder.schema.spec.ts` and/or `folders.service.spec.ts`

### Implementation for User Story 1

- [x] T010 [US1] Create `backend/src/team-folders/create-team-folder.schema.ts`, `team-folders.service.ts`, `team-folders.controller.ts`, `team-folders.module.ts` for POST/GET list/GET by id; register in `backend/src/app.module.ts`
- [x] T011 [US1] On TF create, insert one root `Folder` (`parentId` null, `teamFolderId` set) as specified in `data-model.md`; audit `TEAM_FOLDER_CREATED`
- [x] T012 [US1] Change `backend/src/folders/folders.service.ts` `create` to inherit `teamFolderId` from parent, reject conflicting client `teamFolderId`, require `canWrite`, and stop blind writes from `backend/src/folders/create-folder.schema.ts`
- [x] T013 [US1] Pass current user into `listContents` / `getById` via `backend/src/folders/folders.controller.ts` and filter roots/children by `canRead` (hide TF roots from non-members; keep personal roots)
- [x] T014 [US1] Enforce `canRead` before signed URLs in `backend/src/files/files.service.ts` (`requestUpload`, `createDownloadUrl`); map !canRead → 404
- [x] T015 [US1] Filter `backend/src/search/search.service.ts` (and tests in `search.service.spec.ts`) so inaccessible TF names never appear
- [x] T016 [US1] Apply 404 when `canRead` is false on rename/trash/restore/share in folders/files/shares services (keep 403 when canRead && !action)
- [x] T017 [US1] Make T008 live cases pass; do not weaken assertions to 403 for non-members

**Checkpoint**: Non-member same-org DENY is proven; org ADMIN can create/read TF resources

---

## Phase 4: User Story 2 - Role matrix + membership (Priority: P1)

**Goal**: VIEWER/EDITOR/ORGANIZER/TF ADMIN/org ADMIN match the spec matrix; membership APIs are tenant-scoped

**Independent Test**: Live suite matrix section green

### Tests for User Story 2

- [x] T018 [US2] Extend `backend/test/team-folder-acl.live.integration.e2e-spec.ts` for VIEWER read-only, EDITOR writes without member management, ORGANIZER limited members + share, TF ADMIN TF rename/delete/members, org ADMIN all, last-TF-ADMIN 400, ORGANIZER cannot assign ADMIN/ORGANIZER
- [x] T019 [P] [US2] Unit tests for membership role restrictions in `backend/src/team-folders/` spec file(s)

### Implementation for User Story 2

- [x] T020 [US2] Add membership list/add/update/remove in `backend/src/team-folders/` (`membership.schema.ts`, controller routes per `contracts/team-folders.md`); require target user same `orgId`
- [x] T021 [US2] PATCH/DELETE Team Folder in `team-folders.service.ts` (empty-only delete); audit rename/delete/member actions
- [x] T022 [US2] Ensure `canWrite`/`canShare` distinguish VIEWER vs EDITOR vs ORGANIZER vs TF ADMIN per matrix (EDITOR can share; VIEWER cannot)
- [x] T023 [US2] Filter `listTrash` in `backend/src/files/files.service.ts` by `canRead`; restore/trash still `canWrite`
- [x] T024 [US2] Make T018 pass including cross-tenant 404 on TF ids (must not break IDOR 18/18)

**Checkpoint**: Full matrix enforced server-side

---

## Phase 5: User Story 3 - Content-region UI + i18n (Priority: P2)

**Goal**: Users can browse allowed Team Folders and manage members in the IMKAN One content region

**Independent Test**: Playwright TF path + existing 10/10

### Tests for User Story 3

- [ ] T025 [US3] Add one Playwright flow (authorized TF visible; non-member cannot open) without using `.first()` anti-patterns from Phase 04; keep `frontend/e2e/workdrive-flow.spec.ts` existing 10 tests intact
- [x] T026 [P] [US3] Extend `frontend/src/i18n/i18n.spec.ts` and `frontend/src/lib/workspace-routes.spec.ts` for new keys/routes

### Implementation for User Story 3

- [x] T027 [P] [US3] Add API client `frontend/src/lib/api/team-folders.ts` (no `orgId` in requests)
- [x] T028 [P] [US3] Add EN/AR strings in `frontend/src/i18n/messages/en.json` and `ar.json`
- [x] T029 [US3] Add nav + pages under `frontend/src/app/files/` (team folders list, open root, members) using existing layout; update `frontend/src/lib/workspace-routes.ts` and `workdrive-nav.tsx`
- [x] T030 [US3] Hide mutate/share/member controls for VIEWER in `frontend/src/components/file-browser.tsx` (and related modals) **without** treating UI as authorization
- [ ] T031 [US3] Run Playwright gate `npm run test:e2e:browser:gate` from `frontend` after backend+frontend are running per existing e2e config (`node dist/src/main.js`)

**Checkpoint**: UI usable; server still denies unauthorized calls

---

## Phase 6: Polish, docs, Phase 04 protection

- [ ] T032 Re-run IDOR live suite `backend/test/idor.live.integration.e2e-spec.ts` (expect 18/18)
- [ ] T033 Re-run browser gate (expect existing 10 plus new TF case if included in the same spec file)
- [ ] T034 [P] Update Team Folder/ACL sections only in `docs/api/API-CONTRACTS.md`, `docs/permissions/PERMISSION-IMPLEMENTATION-PLAN.md`, `docs/permissions/AUTHORIZATION-ARCHITECTURE.md`, `docs/specifications/FUNCTIONAL-REQUIREMENTS.md` (F-201 note), `docs/plan/TRACEABILITY-MATRIX.md` — do not migrate `/api/v1`, login, Zod, or Testcontainers
- [ ] T035 Record Phase 05 implementation evidence under `docs/releases/` only when tests actually passed; update `docs/agent/PROJECT-STATE.md` and `CURRENT-PHASE.md`
- [ ] T036 [P] Follow `specs/001-team-folders-acl/quickstart.md` as the operator checklist

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No code changes
- **Foundational (Phase 2)**: Blocks US1–US3
- **US1 (Phase 3)**: DENY + create TF + inherit + search/download
- **US2 (Phase 4)**: Depends on US1 APIs existing; adds membership + matrix
- **US3 (Phase 5)**: Depends on US1+US2 APIs
- **Polish (Phase 6)**: Depends on desired stories complete

### User Story Dependencies

- **US1**: After Phase 2
- **US2**: After US1 create/get/ACL overlay
- **US3**: After US1+US2 HTTP contracts

### Parallel Opportunities

- T002, T004 after T003 design is known
- T009 with T008
- T019 with T018
- T027 / T028 in parallel after contracts stabilize
- T034 docs after behavior is frozen

---

## Parallel Example: User Story 1

```text
T008 live ACL failing tests
T009 folder teamFolderId unit tests
then T010–T016 implementation
then T017 green live US1
```

---

## Implementation Strategy

### MVP (US1 only)

1. Phase 2 PermissionService
2. Phase 3 Team Folder create/list/get + DENY on descendants
3. Stop and validate T008

### Full Phase 05

1. US1 DENY boundary
2. US2 membership + matrix
3. US3 UI
4. Phase 6 regression + doc corrections + evidence

Do not implement SSO, S3 live, Docker, or personal-folder DENY-by-default.

---

## Notes

- JWT minting for tests is a bounded prerequisite, not an auth product (DEC-007 stays open).
- Never start Docker/MinIO.
- Never claim PASS without executed test output.
- Do not begin T003+ until the user explicitly authorizes Phase 05 implementation.
