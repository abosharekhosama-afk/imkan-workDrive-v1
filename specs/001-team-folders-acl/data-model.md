# Data Model: Team Folders ACL

**Feature**: `specs/001-team-folders-acl`  
**Source of truth**: `backend/prisma/schema.prisma` (already migrated: `20260816101000_002_team_folders`)

## Existing entities (reuse)

### TeamFolder

| Field | Type | Notes |
| :--- | :--- | :--- |
| id | UUID | PK |
| orgId | UUID | Tenant; JWT `org_id` must match |
| name | string | Display name |
| isPublicToOrg | boolean | Default false. **Ignored for ACL in Phase 05** |

Relations: members, folders.

### TeamFolderMember

| Field | Type | Notes |
| :--- | :--- | :--- |
| teamFolderId + userId | composite PK | |
| orgId | UUID | Must equal both the Team Folder org and the user’s org |
| role | TeamFolderRole | ADMIN, ORGANIZER, EDITOR, VIEWER |

### Folder

`teamFolderId` optional. Null = personal/My Folders (Phase 04 ACL). Non-null = Team Folder resource (DENY unless membership or org ADMIN).

### File

No `teamFolderId` column. Inherit via `folder.teamFolderId`. `folderId` null = personal (Phase 04).

### User / OrgRole

`OrgRole`: ADMIN | MEMBER only. Team Folder VIEWER is **not** an OrgRole (DEC-009).

## Application invariants (no migration unless implementation cannot enforce)

1. Creating a Team Folder creates one root Folder: `orgId` = TF org, `teamFolderId` = TF id, `parentId` null, `ownerId` = creator, `name` = TF name (or same name).
2. Child folders copy parent `teamFolderId`. Client cannot retarget.
3. Files in a TF folder inherit that TF for PermissionService.
4. Membership `userId` must be a User with the same `orgId` as the Team Folder.
5. At least one TF ADMIN should remain if any TF ADMIN rows exist; cannot delete the last TF ADMIN.
6. Org ADMIN need not have a membership row.

## Phase 05 migration stance

**Default: no new migration.** Schema already supports the feature. Add a migration only if a uniqueness rule is required in MySQL (for example one root folder per TF) and cannot be kept as an application invariant.

Do not add OrgRole VIEWER. Do not add Super Admin. Do not add file-level ACL tables (out of scope).

## Authorization resolution (logical)

```text
resourceOrg = folder.orgId | file.orgId | teamFolder.orgId
if jwt.org_id != resourceOrg → DENY (404)

if jwt.role == ADMIN → ALLOW per org-admin column of matrix

teamFolderId = folder.teamFolderId or file.folder.teamFolderId
if teamFolderId is null → personal Phase 04 (read if same org; write/share if owner MEMBER or org ADMIN)

member = TeamFolderMember(teamFolderId, jwt.sub)
if missing → DENY (404)
else apply TeamFolderRole matrix
```

## Audit

New actions (string `AuditLog.action`): `TEAM_FOLDER_CREATED`, `TEAM_FOLDER_RENAMED`, `TEAM_FOLDER_DELETED`, `TEAM_FOLDER_MEMBER_ADDED`, `TEAM_FOLDER_MEMBER_UPDATED`, `TEAM_FOLDER_MEMBER_REMOVED`. Reuse existing `orgId`, `actorId`, `resourceType`, `resourceId`.
