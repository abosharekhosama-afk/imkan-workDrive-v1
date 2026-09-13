# Permission Implementation Plan

## Enforcement Service

- Create `PermissionService.ts` in `backend/src/permissions/`.
- Methods: `canRead(user, resource)`, `canWrite(user, resource)`, `canShare(user, resource)`, `canManageTeamFolder(user, resource)`, `canManageMembers(user, resource)`, `canAssignTeamFolderRole(user, resource, targetRole)`, `canCreateTeamFolder(user)`.

## Logic Hierarchy

- JWT `org_id` is the authoritative tenant scope (never client `orgId`).
- Organization Administrator (`users.role === ADMIN`) has full access within their org.
- Personal resources (`teamFolderId` null): Same-org read; write/share = org ADMIN or resource owner MEMBER.
- Team Folder resources: Default DENY. Access granted only via explicit Team Folder membership with sufficient role, or org ADMIN.
  - `canRead`: Org ADMIN, TF ADMIN, ORGANIZER, EDITOR, VIEWER (members only).
  - `canWrite`: Org ADMIN, TF ADMIN, ORGANIZER, EDITOR.
  - `canShare`: Org ADMIN, TF ADMIN, ORGANIZER, EDITOR.
  - `canManageTeamFolder`: Org ADMIN, TF ADMIN.
  - `canManageMembers`: Org ADMIN, TF ADMIN, ORGANIZER (EDITOR/VIEWER only).
- Cross-tenant: Always 404.
- `isPublicToOrg` flag: Ignored for ACL.
- JWT `role: VIEWER` is not a valid OrgRole; does not grant write/share on personal resources.

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
- Unit tests: `backend/src/permissions/permission.service.spec.ts` (100% matrix coverage)
- Live integration tests: `backend/test/team-folder-acl.live.integration.e2e-spec.ts` (same-org non-member DENY, role matrix, cross-tenant)
- IDOR regression: `backend/test/idor.live.integration.e2e-spec.ts` (18/18 pass)
- Frontend UI: Team Folders list, member management, role-based action hiding
- i18n: English/Arabic strings for all new UI elements

## Tasks Completed

- [x] Implement `PermissionService` with async membership lookup
- [x] Update `FoldersService`, `FilesService`, `SharesService`, `SearchService` to use `PermissionService`
- [x] Implement Team Folder CRUD + membership APIs
- [x] Enforce DENY-by-default for Team Folder resources
- [x] Filter search results by accessible Team Folders
- [x] Filter trash list by canRead
- [x] Add Team Folder navigation and pages in frontend
- [x] Add role-based UI hiding (VIEWER cannot mutate/share/manage members)
- [x] i18n localization for EN/AR

## Test Requirements

- Unit: PermissionService matrix (org ADMIN, each TF role, non-member, cross-tenant, personal vs TF)
- Live integration: same-org non-member denials; VIEWER/EDITOR/ORGANIZER/TF ADMIN/org ADMIN matrix; search leak test; download URL not issued without ACL; cross-tenant still 404
- Playwright: Keep My Folders 10/10; add Team Folder path (authorized browse + unauthorized 404/empty)
- Do not regress IDOR live suite 18/18

