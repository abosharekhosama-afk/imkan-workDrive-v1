# Research: Team Folders and Intra-Organization Authorization

**Feature**: `specs/001-team-folders-acl`  
**Date**: 2026-08-17  
**Phase**: 05 Spec Kit (discovery only — not implemented)

## Verified Phase 04 baseline

- Phase 04 PASS (`docs/releases/PHASE-04-COMPLETION.md`).
- Cross-tenant IDOR live: 18/18 (`backend/test/idor.live.integration.e2e-spec.ts`).
- Browser E2E: 10/10 (`frontend/e2e/workdrive-flow.spec.ts`) on personal/My Folders flow.
- Storage: `STORAGE_DRIVER=local` verified; S3 adapter retained, not live.
- JWT: `sub` + `org_id` + `role`; no `POST /auth/login`. Tests mint JWTs.
- Docker/MinIO forbidden.

## Code verification (2026-08-17)

| Finding | Verified in repository |
| :--- | :--- |
| `canRead()` does not exist | `backend/src/permissions/permission.service.ts` — only `canShare` / `canWrite` (write aliases share). |
| VIEWER in tests, not OrgRole | Prisma `OrgRole` is `ADMIN` \| `MEMBER`. Unit tests pass `role: 'VIEWER'`. `TeamFolderRole` already includes VIEWER. |
| Team Folder schema exists | `TeamFolder`, `TeamFolderMember` in `schema.prisma`. No Nest controllers/services/UI. |
| `teamFolderId` accepted without membership checks | `parseCreateFolder` optional UUID; `FoldersService.create` writes it with no existence/membership validation. |
| Org JWT can read everything | `FoldersService.listContents` / `getById` and `FilesService.createDownloadUrl` check tenant + deletedAt, **not** `canRead`. |
| Upload ignores write ACL | `requestUpload` checks folder org only, not `canWrite`. |
| Search is tenant-wide names | `SearchService.search` filters `orgId` only. |
| Cross-tenant IDOR verified | Live suite still the authority; must stay green. |
| Browser E2E 10/10 | Uses seed org admin + personal folders (`teamFolderId` null). Must remain green. |

## Documentation contradictions (do not silently rewrite in this cycle except Phase 05-owned docs)

| Document | Claim | Actual code |
| :--- | :--- | :--- |
| `docs/api/API-CONTRACTS.md` | Base `/api/v1`; `POST /auth/login`; cursor pagination; Zod | No prefix; no login; no cursor; custom parsers |
| `docs/permissions/PERMISSION-IMPLEMENTATION-PLAN.md` | `canRead`; hierarchy explicit share > team role > org role | No `canRead`; no explicit internal shares; no team APIs |
| `docs/testing/TEST-ARCHITECTURE.md` | Testcontainers, coverage CI | Docker forbidden; no Testcontainers; Playwright + Jest e2e vs real MySQL |
| `docs/plan/TRACEABILITY-MATRIX.md` | F-201 Team Folders → T-301 | T-301 is personal/org folders, not team-folder APIs |
| `docs/plan/IMPLEMENTATION-PLAN.md` | Slice 8 internal explicit sharing | Public links only |

**Phase 05 must correct** (as part of this feature’s documentation tasks): permission plan + API contracts **for Team Folder endpoints and ACL rules only**. Unrelated cleanup (`/api/v1`, login, Zod, Testcontainers) stays out of scope.

## Decision: personal vs team-folder resources

**Personal / My Folders** (`folders.teamFolderId` null, files in those folders): keep Phase 04 rules so existing E2E/IDOR personal flows stay valid.

- Same-org JWT may list/get/download/search personal resources.
- Mutate/share: org ADMIN or resource owner MEMBER (`PermissionService` today).

**Team Folder resources** (`teamFolderId` set, inherited by descendants): default **DENY**. Allow only:

1. `users.role === ADMIN` in the same org, or
2. `team_folder_members` row for that user + Team Folder with a role that grants the action.

## Decision: role matrix (Team Folder roles)

Org `ADMIN` is not a Team Folder role; it is organization administrator authority (always allowed for that org’s Team Folders).

| Action | Org ADMIN | TF ADMIN | ORGANIZER | EDITOR | VIEWER | Non-member |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| Create Team Folder | Y | N | N | N | N | N |
| Get/list Team Folder | Y | Y | Y | Y | Y | N (404) |
| Update Team Folder name | Y | Y | N | N | N | N |
| Delete Team Folder | Y | Y | N | N | N | N |
| Add/remove members | Y | Y | Y* | N | N | N |
| Assign TF ADMIN role | Y | Y | N | N | N | N |
| Read list/get/search/download | Y | Y | Y | Y | Y | N |
| Create child folder / upload | Y | Y | Y | Y | N | N |
| Rename folder/file | Y | Y | Y | Y | N | N |
| Trash file / restore | Y | Y | Y | Y | N | N |
| Delete empty child folder | Y | Y | Y | Y | N | N |
| Create public share | Y | Y | Y | Y | N | N |

\* ORGANIZER may add/update/remove members with role EDITOR or VIEWER only. Cannot grant/revoke TF ADMIN or ORGANIZER. Cannot remove the last TF ADMIN.

## Decision: inheritance

- Creating a folder **inside** a Team Folder folder copies ancestor `teamFolderId`. Client cannot retarget `teamFolderId` to another TF.
- Root of a Team Folder is a folder with `teamFolderId` set and `parentId` null (or a designated root created with the TF).
- Files inherit ACL from `folder.teamFolderId` (or null = personal).
- Shares and search and download resolve the same inherited TF id.

## Decision: errors

- `canRead` is false (non-member, cross-tenant, unknown id): **404**. Do not leak existence.
- `canRead` is true but the action is not allowed (for example VIEWER upload, EDITOR manage members): **403**.
- Invalid payloads: **400**. Unauthenticated: **401**.
- Personal-folder write denial keeps Phase 04 **403** after the resource is found in-tenant.

## Decision: `isPublicToOrg`

`team_folders.is_public_to_org` exists (default `false`). Phase 05 **must not** treat this flag as org-wide read. Authorization is membership or org ADMIN only. Do not add a public-to-org ACL path in this phase.

## Decision: F-201 vs OrgRole

`FUNCTIONAL-REQUIREMENTS.md` F-201 says Admin/Organizer can create Team Folders. Prisma `OrgRole` is only `ADMIN` | `MEMBER` (DEC-009). There is no org-level ORGANIZER. Phase 05 interprets **create Team Folder** as **org ADMIN only**. Team Folder ORGANIZER cannot exist before the Team Folder exists and does not gain create-TF. Document this as a Phase 05 correction of F-201 (implementation docs task — do not rewrite F-201 during discovery).

## Decision: auth for tests

No Phase 05 login/SSO. Tests continue to mint JWTs (`jsonwebtoken` + `JWT_SECRET`) as IDOR/Playwright already do. Seed users remain MEMBER except seed admin.

## Decision: storage

Do not change `STORAGE_DRIVER=local`. Enforce ACL **before** `createUploadUrl` / `createDownloadUrl`.

## Risks

- Broadening DENY to personal folders would fail Phase 04 Playwright 10/10 — must not.
- `teamFolderId` on create is already writable; implementation must stop unvalidated assignment.
- Search full-text cannot leak TF names to non-members — must extra-filter by allowed TF ids (or `teamFolderId` null).
- Prisma unique update/delete still cannot AND orgId; keep findFirst + ACL then update by id.

## Out of scope (research)

SSO, comments, preview, sync, quotas, admin console, S3 live, multipart, blob purge, Docker.
