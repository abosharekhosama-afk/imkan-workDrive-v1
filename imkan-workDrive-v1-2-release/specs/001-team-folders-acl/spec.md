# Feature Specification: Team Folders and Intra-Organization Authorization

**Feature Branch**: `001-team-folders-acl`

**Created**: 2026-08-17

**Status**: Draft (Spec Kit complete — implementation not authorized)

**Input**: User description: "Team Folders and Intra-Organization Authorization for IMKAN WorkDrive"

## Problem Statement

Phase 04 delivered tenant-isolated files, folders, public shares, search, trash, and local object storage. Cross-tenant access is denied. Inside a tenant, any valid organization JWT can list, open, search, and download resources, including those that will belong to Team Folders.

The database already has `team_folders` and `team_folder_members` with roles ADMIN, ORGANIZER, EDITOR, and VIEWER. There are no Team Folder APIs, no membership checks, and no `canRead` authorization. Clients can send `teamFolderId` when creating a folder without proving membership. Search returns names from the entire tenant.

This is an authorization defect for collaborative Team Folders: same-organization non-members must not see or mutate Team Folder resources.

## Goals

- Provide Team Folder CRUD and membership management, tenant-scoped from JWT `org_id`.
- Enforce server-side `canRead`, `canWrite`, and `canShare` so Team Folder resources default to DENY unless the caller is an explicit member with a sufficient role or an organization administrator.
- Propagate that ACL from Team Folder → folder → file → share create → search → download → upload → rename → trash/restore.
- Keep Phase 04 guarantees: cross-tenant IDOR 18/18, browser E2E 10/10 on personal/My Folders, `STORAGE_DRIVER=local`, no Docker/MinIO, no SSO.

## Non-Goals

- SSO / production identity provider / `POST /auth/login` as a product (DEC-007 remains unresolved).
- Comments, preview, desktop/mobile sync, quotas, billing, admin console.
- Multipart upload, blob purge, AES-at-rest, S3 live verification, Elasticsearch.
- Notifications, unrelated UI redesign, Docker/MinIO.
- Internal user-to-user shares that override Team Folder ACL.
- Org-wide “public to organization” Team Folders (`isPublicToOrg` must not grant access).
- Changing personal/My Folders (`teamFolderId` null) into the same DENY-by-default model (that would break Phase 04 E2E).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Organization admin creates a Team Folder and members cannot see it until invited (Priority: P1)

An organization administrator creates a Team Folder for a project. Same-organization people who are not members must not list it, open it, see its files in search, download from it, or upload into it. After the admin adds a member, that person can access it according to their Team Folder role.

**Why this priority**: This is the security boundary. Without it, Team Folders are only labels on an org-wide open drive.

**Independent Test**: Seed two same-org MEMBER users and one ADMIN. Admin creates a Team Folder and a file inside it. Non-member JWT receives 404 on list/get/children/download/upload/share and zero search hits. Member JWT with EDITOR can read and upload.

**Acceptance Scenarios**:

1. **Given** an org ADMIN JWT, **When** they create a Team Folder with a valid name, **Then** the Team Folder exists in their organization and a root folder is created for it.
2. **Given** a same-org MEMBER who is not a member of that Team Folder, **When** they list Team Folders, get the Team Folder, list its root, get child folders/files, get file metadata via listing, download, upload, rename, trash, restore, or create a share, **Then** each call returns 404 and search does not return the Team Folder name or its file/folder names.
3. **Given** a JWT whose `org_id` is a different organization, **When** they use the Team Folder or child ids, **Then** they receive 404 (existing cross-tenant IDOR behavior remains).

---

### User Story 2 - Role matrix: VIEWER read-only, EDITOR content write, ORGANIZER collaboration, TF ADMIN and org ADMIN administration (Priority: P1)

Members receive only the permissions in the matrix. The client may hide buttons; the server is the authority. JWT `org_id` is the tenant; client `orgId` is never trusted.

**Why this priority**: Privilege escalation inside the tenant is as serious as cross-tenant IDOR.

**Independent Test**: Four memberships (VIEWER, EDITOR, ORGANIZER, TF ADMIN) plus org ADMIN and a non-member, same org. Assert each matrix cell with live HTTP tests.

**Acceptance Scenarios**:

1. **Given** a same-org VIEWER member, **When** they read/list/download/search, **Then** those succeed; **When** they upload, create folder, rename, trash, restore, share, or manage members, **Then** they receive 403.
2. **Given** a same-org EDITOR, **When** they create folders, upload, rename, trash, and restore inside the Team Folder, **Then** those succeed; **When** they manage members or the Team Folder record, **Then** they receive 403.
3. **Given** a same-org ORGANIZER, **When** they perform EDITOR operations plus share and add/remove EDITOR or VIEWER members, **Then** those succeed; **When** they assign TF ADMIN or ORGANIZER, delete the Team Folder, or rename the Team Folder, **Then** they receive 403.
4. **Given** a TF ADMIN or org ADMIN, **When** they perform administrative operations defined in the matrix, **Then** those succeed within the same organization only.

---

### User Story 3 - Browse and manage Team Folders in the IMKAN One content region (Priority: P2)

Signed-in users see Team Folders they are allowed to see, open them like My Folders, and (when permitted) manage members. English and Arabic strings are used. No platform header/sidebar/account menu is added.

**Why this priority**: APIs without a content-region UI are not usable in the product, but UI must not become the authorization layer.

**Independent Test**: Playwright path: inject org admin JWT, create/open a Team Folder in the content region, confirm a non-member session cannot open it. Existing 10/10 My Folders flow stays green.

**Acceptance Scenarios**:

1. **Given** an authorized member, **When** they open Team Folders in the content region, **Then** they see only Team Folders they may read, with localized labels.
2. **Given** a VIEWER, **When** they open a Team Folder, **Then** mutate controls are absent or disabled in the UI **and** the API still rejects mutate calls.
3. **Given** the existing My Folders Playwright suite, **When** Phase 05 ships, **Then** those 10 tests still pass.

---

### Edge Cases

- Creating a folder inside a Team Folder folder: `teamFolderId` is copied from the parent; a client-supplied different `teamFolderId` is ignored or rejected with 400.
- Creating a folder with a `teamFolderId` that does not exist in the JWT org: 404.
- Creating a folder with `teamFolderId` when the user cannot write that Team Folder: 404 if they cannot read it, 403 if they can read (VIEWER).
- Last TF ADMIN cannot be removed (400). ORGANIZER cannot remove TF ADMIN or ORGANIZER rows.
- Member `userId` must belong to the same organization (404/400; never attach a cross-tenant user).
- Trash listing must not include Team Folder files the caller cannot read.
- Download and upload must not issue storage capability URLs before ACL succeeds.
- Public share **verify** (unauthenticated link) remains capability-based after a permitted `canShare` create; it does not re-check Team Folder membership (same as Phase 04 public links).
- JWT `role` values other than `ADMIN`/`MEMBER` are not Team Folder roles; Team Folder VIEWER is membership `TeamFolderRole`, not `OrgRole`.
- `isPublicToOrg=true` must not widen access if present in existing rows.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Org ADMIN MUST be able to create, rename, and delete Team Folders in their JWT organization.
- **FR-002**: The system MUST support Team Folder roles ADMIN, ORGANIZER, EDITOR, and VIEWER via membership rows (not via `OrgRole`).
- **FR-003**: Org ADMIN and TF ADMIN MUST be able to add, update, and remove members for any Team Folder role in that Team Folder, except removing the last TF ADMIN.
- **FR-004**: ORGANIZER MUST be able to add, update, and remove members with role EDITOR or VIEWER only.
- **FR-005**: EDITOR and VIEWER MUST NOT manage members or the Team Folder record.
- **FR-006**: Creating a Team Folder MUST create exactly one root folder in the same org with that `teamFolderId` and `parentId` null.
- **FR-007**: Child folders and files MUST inherit the ancestor Team Folder for authorization (folder `teamFolderId`; file via its folder).
- **FR-008**: PermissionService MUST implement `canRead`, `canWrite`, and `canShare` used by folder, file, share, search, download, upload, rename, trash, and restore paths.
- **FR-009**: Client-provided organization identifiers MUST NOT determine tenant or ACL; JWT `org_id` is authoritative.
- **FR-010**: Personal resources (`teamFolderId` null) MUST keep Phase 04 rules: same-org read; write/share = org ADMIN or resource owner MEMBER.
- **FR-011**: Team Folder resources MUST default DENY unless org ADMIN or a membership role grants the action (matrix below).
- **FR-012**: Search MUST return only folders/files the caller `canRead` (no name/metadata leak from inaccessible Team Folders).
- **FR-013**: Download MUST evaluate `canRead` before creating or returning a storage capability URL. Upload MUST evaluate `canWrite` on the target folder before creating metadata or an upload URL.
- **FR-014**: The content-region UI MUST list/open Team Folders the user can read and MUST localize all new strings in English and Arabic (LTR/RTL via existing locale). Mutate controls MAY hide by role; they MUST NOT authorize.
- **FR-015**: Audit logs MUST record Team Folder create/update/delete and membership add/update/remove with org, actor, action, and resource ids.
- **FR-016**: Existing public-share create remains subject to `canShare`; unauthenticated public verify/download-by-link remains Phase 04 behavior.

### Security Requirements

- **SR-001**: Same-org non-member MUST receive 404 (not 200, not a distinct “forbidden Team Folder” body) for Team Folder and descendant resource operations listed in US1.
- **SR-002**: Cross-tenant IDOR tests MUST remain green (18/18 live suite).
- **SR-003**: No authorization decision MAY be delegated to frontend/localStorage/query `orgId`.
- **SR-004**: VIEWER MUST NOT mutate; EDITOR MUST NOT manage members; ORGANIZER MUST NOT exceed the matrix; TF ADMIN and org ADMIN MUST NOT act outside their organization.
- **SR-005**: Storage signed URLs MUST NOT be issued for unauthorized download/upload.
- **SR-006**: Prefer 404 when the caller must not learn that the resource exists; use 403 only when `canRead` is true and the specific action is denied.

### Permission Matrix

Roles: **Org ADMIN** is `users.role = ADMIN` (organization administrator). **TF ADMIN / ORGANIZER / EDITOR / VIEWER** are `team_folder_members.role`. **Non-member** is same-org with no membership row.

| Action | Org ADMIN | TF ADMIN | ORGANIZER | EDITOR | VIEWER | Non-member |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| Create Team Folder | Y | N | N | N | N | N |
| List/get Team Folder | Y | Y | Y | Y | Y | N (404) |
| Rename Team Folder | Y | Y | N | N | N | N |
| Delete Team Folder | Y | Y | N | N | N | N |
| Manage members (any role except last TF ADMIN) | Y | Y | N | N | N | N |
| Manage members EDITOR/VIEWER only | Y | Y | Y | N | N | N |
| Read list/get/search/download | Y | Y | Y | Y | Y | N (404) |
| Create child folder / upload | Y | Y | Y | Y | N (403) | N (404) |
| Rename folder/file | Y | Y | Y | Y | N (403) | N (404) |
| Trash file / restore file | Y | Y | Y | Y | N (403) | N (404) |
| Delete empty child folder | Y | Y | Y | Y | N (403) | N (404) |
| Create public share | Y | Y | Y | Y | N (403) | N (404) |

Personal resources (`teamFolderId` null): not in this table. Same-org JWT may read; org ADMIN or owning MEMBER may write/share (Phase 04). JWT org `role: VIEWER` is not a valid OrgRole and MUST NOT gain write/share on personal resources (existing unit tests).

### API Behavior

Existing routes stay without `/api/v1` prefix (code is source of truth). New Team Folder routes follow the same style.

| Method | Path | Auth | Success | Notes |
| :--- | :--- | :--- | :--- | :--- |
| POST | `/team-folders` | JWT, org ADMIN | 201 | Body `{ name }`. Creates TF + root folder. |
| GET | `/team-folders` | JWT | 200 | Only TFs the caller can read. |
| GET | `/team-folders/:id` | JWT, canRead | 200 | 404 otherwise. |
| PATCH | `/team-folders/:id` | JWT, rename TF | 200 | Body `{ name }`. |
| DELETE | `/team-folders/:id` | JWT, delete TF | 200 | Application-defined empty/cascade: reject if child folders/files exist (400), same spirit as folder delete. |
| GET | `/team-folders/:id/members` | JWT, canRead | 200 | Member list; 404 if cannot read TF. |
| POST | `/team-folders/:id/members` | JWT, manage members | 201 | `{ userId, role }`. Target user same org. |
| PATCH | `/team-folders/:id/members/:userId` | JWT, manage members | 200 | `{ role }`. |
| DELETE | `/team-folders/:id/members/:userId` | JWT, manage members | 200 | Last TF ADMIN → 400. |

Existing `/folders`, `/files`, `/shares`, `/search`, `/files/trash` MUST apply the matrix via PermissionService. `GET /folders` and `GET /folders/:id` MUST filter children the caller cannot read (Team Folder roots hidden from non-members).

### Data Model Implications

Use existing `TeamFolder`, `TeamFolderMember`, `Folder.teamFolderId`. No new enum values. Phase 05 SHOULD NOT require a migration if application rules (one root folder per TF, inherit `teamFolderId`) can be enforced in services. `isPublicToOrg` remains unused for ACL.

### Authorization Rules (inheritance)

```text
JWT.org_id  → tenant (never client orgId)
users.role === ADMIN && same org → org administrator (all TF actions in matrix)
else resource.teamFolderId == null → Phase 04 personal rules
else membership(user, teamFolderId) → TeamFolderRole matrix
else DENY (404)
```

File ACL uses the file’s folder `teamFolderId` (if folderId is null, treat as personal). Shares: `canShare` on the target file/folder. Search: post-filter or query-constrain by allowed Team Folder ids plus personal. Download/upload: ACL then storage URL.

### Error / Status Semantics

| Situation | Status |
| :--- | :--- |
| Missing/invalid JWT | 401 |
| Malformed body/name | 400 |
| Cross-tenant or cannot read | 404 |
| Can read, action not allowed | 403 |
| Last TF ADMIN removal / non-empty TF delete | 400 |

### Frontend Requirements

- Content region only (existing files layout / IMKAN One mount). No extra chrome.
- Navigation entry for Team Folders; browse TF root using existing file browser patterns.
- Member management UI for roles that may manage members (org ADMIN, TF ADMIN, ORGANIZER with limited roles).
- Do not send `orgId` from the client. Do not treat UI role as authorization.

### i18n Requirements

- All new visible strings in `frontend/src/i18n/messages/en.json` and `ar.json` with matching keys.
- No hard-coded English/Arabic in TSX. RTL/LTR via existing locale provider.

### Test Requirements

- Unit: PermissionService matrix (org ADMIN, each TF role, non-member, cross-tenant, personal vs TF).
- Live integration (real MySQL, minted JWTs, no Docker): same-org non-member denials (US1 list); VIEWER/EDITOR/ORGANIZER/TF ADMIN/org ADMIN matrix; search leak test; download URL not issued without ACL; cross-tenant still 404.
- Playwright: keep `workdrive-flow.spec.ts` 10/10; add one Team Folder path (authorized browse + unauthorized 404/empty).
- Do not regress `backend/test/idor.live.integration.e2e-spec.ts` 18/18.
- Browser gate `npm run test:e2e:browser:gate` remains the UI gate.

### Key Entities

- **Team Folder**: Named collaborative boundary inside one organization.
- **Team Folder Member**: User in that organization with one Team Folder role.
- **Folder / File**: Inherit Team Folder id for ACL; personal when id is null.
- **Organization administrator**: User with org role ADMIN; not a membership row.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of matrix cells in this spec have an automated assertion (unit and/or live HTTP).
- **SC-002**: Same-org non-member cannot obtain a Team Folder or descendant name via list, get, search, or download URL.
- **SC-003**: Phase 04 IDOR live suite stays 18/18 and Playwright My Folders suite stays 10/10.
- **SC-004**: A permitted member can create a Team Folder (admin), add a member, and complete upload/download of a file inside it using local storage, without Docker or S3.
- **SC-005**: Unauthorized callers never receive a storage capability URL for Team Folder objects.

## Assumptions

- Tests continue to mint JWTs with `JWT_SECRET` (IDOR and Playwright already do). No login product in Phase 05.
- `STORAGE_DRIVER=local` remains the verified storage path.
- Seed org remains one organization with three users; ACL tests create additional users/memberships in the live DB as needed and clean up.
- Delete Team Folder is rejected while any folder/file still references it (no silent cascade of blobs).
- EDITOR may create public shares (negative tests target VIEWER and non-members).
- F-201 “Organizer creates Team Folders” is interpreted as org ADMIN only until OrgRole gains an organizer (it must not).

## Traceability

| This spec | Existing artifact | Resolution |
| :--- | :--- | :--- |
| FR-001 create TF | F-201 | Interpret as org ADMIN; record doc correction task |
| FR-002 roles | F-202, TeamFolderRole enum | Implement; F-203 comments remain out of scope |
| Matrix | ACCESS-CONTROL-MODEL, AUTHORIZATION-ARCHITECTURE | Architecture says ORGANIZER “all except delete TF”; Phase 05 matrix is stricter (no TF rename/delete, limited member roles) — correct those docs in Phase 05 polish, do not silently rewrite during discovery |
| canRead/canWrite/canShare | PERMISSION-IMPLEMENTATION-PLAN | Implement; drop “explicit internal share overrides TF” for this phase |
| APIs | API-CONTRACTS.md `/api/v1` | Do not migrate to `/api/v1` in Phase 05; add Team Folder routes to contracts as they actually ship |
| Personal folders | T-301 / Phase 04 | Preserve |
| IDOR | TEST-ARCHITECTURE / Phase 04 live suite | Preserve; add same-org ACL suite |

## Dependencies

- Phase 04 PASS (JWT guard, tenant interceptor, Prisma Team Folder tables, local storage, folder/file/share/search services).
- MySQL `workdrive_dev` and seed users.
- Existing i18n and content-region shell.

## Risks

- Applying DENY-by-default to personal folders would fail Playwright 10/10.
- `GET /folders` currently lists all tenant roots; hiding TF roots must not hide personal roots.
- Making PermissionService async (membership lookup) touches every write/share call site.
- Search FULLTEXT can still match rows the query layer must drop — filter must be complete.
- Leftover `teamFolderId` on create without checks is an existing hole; implementation must close it first.

## Explicit Exclusions

SSO, comments, preview, sync, quotas, billing, admin console, multipart, blob purge, AES-at-rest, S3 live, Elasticsearch, notifications, Docker/MinIO, `/api/v1` migration, login/SSO phase, public-to-org Team Folders, internal explicit shares.

## Acceptance Criteria (feature)

1. Research, spec, plan, and tasks exist under `specs/001-team-folders-acl/` (this cycle).
2. After authorized implementation: matrix, same-org ACL, cross-tenant, inheritance, search/download/share ACL, and Phase 04 protections are proven by tests listed above.
3. No Phase 05 production implementation occurs until explicitly authorized.
