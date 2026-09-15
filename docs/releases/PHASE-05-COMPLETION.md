# Phase 05 Completion

Phase: 05 — Team Folders and Intra-Organization Authorization

Initial Status: IN_PROGRESS

Final Status: PASS

Date: 2026-08-23

## Scope

Close the same-organization authorization gap for Team Folders:
- Team Folder schema existed but APIs, membership checks, and `canRead` did not.
- Implement Team Folder CRUD + membership management.
- Enforce `canRead`, `canWrite`, `canShare` on every folder, file, share, search, download, upload, rename, and trash/restore path.
- Personal folders (`teamFolderId` null) keep Phase 04 rules so existing E2E stays valid.
- Keep `STORAGE_DRIVER=local`. Do not start Docker, MinIO, or S3 live verification. Do not implement SSO.

## Completed Gates

| Gate | Evidence | Result |
| :--- | :--- | :--- |
| T-003 PermissionService matrix | `backend/src/permissions/permission.service.ts` + `permission.service.spec.ts` | PASS (unit) |
| T-004 Unit matrix coverage | 100% matrix cells: org ADMIN, TF ADMIN, ORGANIZER, EDITOR, VIEWER, non-member, cross-tenant, personal | PASS |
| T-005 Backend unit tests | `npm test` | PASS (26 suites, 169 tests) |
| T-010 Team Folder CRUD APIs | `backend/src/team-folders/` module | PASS |
| T-011 Root folder + audit on create | `TeamFoldersService.create` transaction | PASS |
| T-012 Inherit `teamFolderId` from parent | `FoldersService.create` | PASS |
| T-013 Filter list/get by `canRead` | `FoldersService.listContents`, `getById` | PASS |
| T-014 ACL before signed URLs | `FilesService.requestUpload`, `createDownloadUrl` | PASS |
| T-015 Search filtered by accessible TFs | `SearchService.search` | PASS |
| T-016 404 when `canRead` false | Rename/trash/restore/share paths | PASS |
| T-017 Live ACL tests pass | `backend/test/team-folder-acl.live.integration.e2e-spec.ts` | PASS (1 suite, 28 tests) |
| T-020 Membership CRUD | `TeamFoldersService.addMember/updateMember/removeMember/listMembers` | PASS |
| T-021 PATCH/DELETE TF + audit | `TeamFoldersService.rename/remove` | PASS |
| T-022 Matrix role distinction | `PermissionService.canWrite/canShare` | PASS |
| T-023 Trash filtered by `canRead` | `FilesService.listTrash` | PASS |
| T-024 Live matrix tests pass | Same-org non-member DENY; VIEWER/EDITOR/ORGANIZER/TF ADMIN/org ADMIN matrix | PASS |
| T-027 Frontend API client | `frontend/src/lib/api/team-folders.ts` | PASS |
| T-028 i18n EN/AR strings | `frontend/src/i18n/messages/en.json`, `ar.json` | PASS |
| T-029 Frontend pages | `frontend/src/app/files/team-folders/page.tsx`, folder page with role | PASS |
| T-030 VIEWER UI hiding | `frontend/src/lib/permissions.ts` → `FileBrowser` | PASS |
| T-032 IDOR regression | `npm run test:e2e -- --testPathPatterns=idor.live.integration` | PASS (18/18) |
| T-033 Browser E2E gate | `npm run test:e2e:browser:gate` | PASS (Team Folder case + 10 My Folders) |

## Exact Commands and PASS Results

### Backend Build and Unit Tests

```powershell
cd E:\IMKAN-WorkDrive\backend
npx nest build
npm test
```

Result: nest build exit 0; **26 suites, 169 tests passed**.

### Live ACL Integration Tests (New Suite)

```powershell
cd E:\IMKAN-WorkDrive\backend
npm run test:e2e -- --testPathPatterns=team-folder-acl.live.integration
```

Result: **1 suite, 28 tests passed**.
Covered: same-org non-member 404 on all descendant operations; VIEWER read-only; EDITOR write+share; ORGANIZER limited member management; TF ADMIN TF management; org ADMIN all; last ADMIN removal 400; non-empty TF delete 400; cross-tenant 404; `isPublicToOrg` ignored.

### IDOR Regression (Must Stay Green)

```powershell
cd E:\IMKAN-WorkDrive\backend
npm run test:e2e -- --testPathPatterns=idor.live.integration
```

Result: **1 suite, 18 tests passed** (no regression).

### Frontend Unit Tests

```powershell
cd E:\IMKAN-WorkDrive\frontend
npm run test
```

Result: **26 tests passed**.

### Browser E2E Gate

```powershell
cd E:\IMKAN-WorkDrive\frontend
npm run test:e2e:browser:gate
```

Result: Next.js build PASS; Nest build PASS; Playwright **11 passed** (10 My Folders + 1 Team Folder authorized vs non-member).

## Team Folder ACL Evidence

### Same-org Non-member DENY (US1)

- GET `/team-folders` → 200, empty list (TF hidden)
- GET `/team-folders/:id` → 404
- GET `/folders` (roots) → TF root hidden
- GET `/folders/:tfRootId` → 404
- GET `/files/:id/download` → 404 (no download URL issued)
- POST `/files/upload-request` into TF → 404
- PATCH `/folders/:tfRootId` → 404
- PATCH `/files/:id` → 404
- DELETE `/files/:id` → 404
- POST `/files/:id/restore` → 404
- GET `/files/trash` → TF trashed files hidden
- POST `/shares` for TF file → 404
- GET `/search?q=<tf-name>` → no TF name/file name leaked

### Role Matrix (US2)

| Role | Read | Write | Share | Manage Members | Manage TF | Assign ADMIN/ORG |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| Org ADMIN | ✅ | ✅ | ✅ | ✅ (all) | ✅ | ✅ |
| TF ADMIN | ✅ | ✅ | ✅ | ✅ (all) | ✅ | ✅ |
| ORGANIZER | ✅ | ✅ | ✅ | ✅ (EDITOR/VIEWER) | ❌ | ❌ |
| EDITOR | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| VIEWER | ✅ | ❌ (403) | ❌ (403) | ❌ (403) | ❌ | ❌ |
| Non-member | ❌ (404) | ❌ (404) | ❌ (404) | ❌ (404) | ❌ | ❌ |

### Cross-tenant (US1 + IDOR Regression)

- Tenant B org ADMIN → 404 on Tenant A TF and all descendants
- Tenant B org ADMIN → sees only own org TFs in list

### `isPublicToOrg` Flag

- Non-member with `isPublicToOrg=true` TF → 404 (no access granted)

## Frontend UI (US3)

- Navigation: "Team Folders" link in workspace nav (EN/AR localized)
- `/files/team-folders` page: list TFs user can read; create TF (org ADMIN); open TF root; manage members modal
- `/files/:folderId` page: `FileBrowser` receives `role` prop; VIEWER sees read-only UI (mutate/share/member controls hidden)
- i18n: All new strings in `en.json` and `ar.json` (RTL/LTR via existing locale provider)
- No `orgId` sent from client; UI never authorizes (server is authority)

## Documentation Updates

- `docs/api/API-CONTRACTS.md`: Full Team Folder + updated domain tables with actual routes (no `/api/v1` prefix)
- `docs/permissions/PERMISSION-IMPLEMENTATION-PLAN.md`: Complete matrix, implementation status, test requirements
- `docs/permissions/AUTHORIZATION-ARCHITECTURE.md`: Resolution hierarchy, matrix, negative test evidence
- `docs/specifications/FUNCTIONAL-REQUIREMENTS.md`: F-201 interpretation note (org ADMIN only)

## Honest Limitations

- Docker / MinIO not used. `STORAGE_DRIVER=local` verified.
- SSO provider remains pending (DEC-007).
- Comments, preview, desktop/mobile sync, quotas, billing, admin console remain out of scope.
- Multipart upload, blob purge, AES-at-rest, S3 live, Elasticsearch remain out of scope.
- Internal user-to-user shares that override Team Folder ACL not implemented.
- Org-wide "public to organization" Team Folders (`isPublicToOrg`) must not grant access (enforced).
- Personal folders remain Phase 04 model (not DENY-by-default) to preserve 10/10 Playwright.
- Prisma `update`/`delete` unique `where` still cannot include composite `orgId` AND; tenant isolation for those writes depends on prior `findFirst` + JWT `org_id` checks (proven live by IDOR 18/18).

## Change Records

- `docs/changes/CHANGE-T100.md` through `CHANGE-T801.md` (Phase 04)
- Phase 05 changes recorded in implementation evidence above.

## Git Note

Working tree contains Phase 05 implementation and updated docs. This record does not include a git commit. Secrets in `backend/.env` must not be committed.

Phase 05 is **COMPLETE** and ready for next phase authorization.