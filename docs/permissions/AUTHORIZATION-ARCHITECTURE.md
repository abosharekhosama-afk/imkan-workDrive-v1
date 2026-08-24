# Authorization Architecture

## Enforcement

- 100% Server-side via unified `PermissionService` (`backend/src/permissions/permission.service.ts`).
- `JwtAuthGuard` + `TenantContextInterceptor` verify JWT validity and inject `user` (with `org_id`, `sub`, `role`) into request context.
- All handlers call `PermissionService.canRead/canWrite/canShare/canManageTeamFolder/canManageMembers/canAssignTeamFolderRole` before any mutation or data access.
- No authorization decision delegated to frontend/localStorage/query `orgId`.

## Resolution Hierarchy

```text
JWT.org_id  → tenant (never client orgId)
users.role === ADMIN && same org → org administrator (all TF actions in matrix)
else resource.teamFolderId == null → Phase 04 personal rules (same-org read; write/share = org ADMIN or owner MEMBER)
else membership(user, teamFolderId) → TeamFolderRole matrix
else DENY (404)
```

1. **Org Administrator** (`users.role === ADMIN`): Full access within their organization. Can create Team Folders, manage any Team Folder, manage any member.
2. **Personal Resources** (`teamFolderId` null): Same-org JWT may read; org ADMIN or owning MEMBER may write/share (Phase 04 rules). JWT `role: VIEWER` is not a valid OrgRole and does not grant write/share.
3. **Team Folder Resources** (`teamFolderId` present): Default DENY unless:
   - Org ADMIN
   - Explicit Team Folder membership with role granting the action
   - Matrix below
4. **Cross-tenant**: Always 404 (existing IDOR protection).
5. **`isPublicToOrg` flag**: Ignored for ACL (must not widen access).
6. **Public Share Verify** (unauthenticated): Capability-based after permitted `canShare` create; does not re-check Team Folder membership.

## Team Folder Role Matrix

| Action | Org ADMIN | TF ADMIN | ORGANIZER | EDITOR | VIEWER | Non-member |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| Create Team Folder | Y | N | N | N | N | N |
| List/get Team Folder | Y | Y | Y | Y | Y | N (404) |
| Rename Team Folder | Y | Y | N | N | N | N |
| Delete Team Folder | Y | Y | N | N | N | N |
| Manage members (any role) | Y | Y | N | N | N | N |
| Manage members (EDITOR/VIEWER) | Y | Y | Y | N | N | N |
| Read/list/search/download | Y | Y | Y | Y | Y | N (404) |
| Create child folder/upload | Y | Y | Y | Y | N (403) | N (404) |
| Rename folder/file | Y | Y | Y | Y | N (403) | N (404) |
| Trash/restore file | Y | Y | Y | Y | N (403) | N (404) |
| Delete empty child folder | Y | Y | Y | Y | N (403) | N (404) |
| Create public share | Y | Y | Y | Y | N (403) | N (404) |

## Implementation Status

✅ **Phase 05 Complete** - All matrix cells implemented and tested:
- `PermissionService` encodes full matrix with async Prisma membership lookup
- `FoldersService`, `FilesService`, `SharesService`, `SearchService` updated to use `PermissionService`
- Team Folder CRUD + membership APIs in `backend/src/team-folders/`
- DENY-by-default enforced on all descendant operations
- Search filters inaccessible Team Folder names
- Trash list filtered by `canRead`
- Frontend UI: Team Folders list, member management modal, role-based action hiding
- i18n: EN/AR strings for all new UI elements

## Negative Authorization Tests (All Passing)

- Same-org non-member: 404 on list/get Team Folder, children, download, upload, rename, trash, restore, share, search name leak
- VIEWER: read OK; write/share/manage members → 403
- EDITOR: write/share OK; manage members/TF record → 403
- ORGANIZER: write/share + add EDITOR/VIEWER members OK; assign ADMIN/ORGANIZER → 400/403; rename/delete TF → 403
- TF ADMIN: full TF management + members OK; last ADMIN removal → 400; non-empty TF delete → 400
- Org ADMIN: all actions within org
- Cross-tenant: 404 on all TF and descendant IDs (IDOR 18/18 regression)
- `isPublicToOrg=true` without membership: 404 (no access granted)
