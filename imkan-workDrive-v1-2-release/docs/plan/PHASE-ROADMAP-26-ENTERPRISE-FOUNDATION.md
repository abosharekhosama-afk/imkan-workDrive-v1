# IMKAN WorkDrive — 20-Feature Enterprise Foundation Plan

## Goal

Move the product from a secure file manager toward a scalable WorkDrive-class collaboration platform without breaking the existing architecture. The implementation follows the current NestJS + Prisma + Next.js patterns and keeps authorization centralized.

## Feature order

### P0 — security and data integrity
1. Authorization engine hardening and centralized action checks.
2. Tenant isolation on every resource path.
3. Team Folder ACL + subfolder permissions.
4. Super Admin/Organization Owner protection.
5. Secure preview and signed download authorization.
6. Upload security, file validation, and malware-scan lifecycle.
7. Audit trail and security event model.
8. Backup/restore and recovery runbooks.

### P1 — collaboration core
9. Version history and retention policy.
10. Advanced sharing with internal/external policy controls.
11. Groups and group-based access.
12. Subfolder-level permissions and hidden folders.
13. Comments and collaboration activity.
14. Notifications and mentions.
15. Advanced search/filter foundation.
16. Data administration: shared items, large files, deleted items.
17. Ownership transfer and user lifecycle.
18. File locking/check-in/check-out foundation.
19. Storage analytics and admin dashboard.
20. Security policy, retention policy, devices, and operational controls.

## Database changes

- Add immutable `Organization.ownerId`.
- Add `User.status`, `avatarUrl`, `lastLoginAt`.
- Add Team Folder external-sharing/download/archive controls.
- Add `COMMENTER` Team Folder role.
- Add `Group` and `GroupMember`.
- Add `FolderPermission` for user/group subfolder ACL and hidden folders.
- Add `SecurityPolicy` and `RetentionPolicy`.
- Add `MalwareScan`, `UserDevice`, and `SecurityEvent`.
- Preserve existing File/FileVersion/StorageObject/Share/Audit models.

## Backend architecture

- Keep `PermissionService` as the single authorization decision point.
- Keep tenant context and organization scoping in the existing Prisma layer.
- Admin-only operational features live under `admin/enterprise.*`.
- Security policy and retention policy are stored per organization.
- AuditLog remains separate from user-facing FileActivity.
- New endpoints must reject cross-tenant IDs before performing mutations.
- Signed URLs are only generated after authorization and never exposed as permanent storage URLs.

## Frontend architecture

- Preserve existing API client modules and page/component conventions.
- Admin Console gains Overview, Groups, Sharing, Security, Retention, Audit and Storage views.
- Share UI uses searchable member identities and submits immutable user IDs.
- Sidebar separates personal files from Team Folders and administrative surfaces.
- RTL top bar keeps profile/avatar and account actions on the left.
- Feature states are designed for progressive enhancement: disabled/unconfigured controls explain what is required instead of silently failing.

## Release gates

1. Prisma schema validation.
2. Migration dry-run against a copy of production-like data.
3. Backend unit/integration tests.
4. IDOR and cross-tenant E2E tests.
5. Frontend typecheck/lint/tests.
6. Browser E2E for personal files, Team Folders, sharing, preview, versions and admin console.
7. Build artifacts for frontend/backend.
8. Backup/restore rehearsal.
9. Security review before production.

## Current revision status

Implemented in source: owner field/backfill, user lifecycle fields, Team Folder settings and Commenter role, groups, subfolder ACL storage/API, security/retention policy APIs, malware scan lifecycle record, device/security-event storage, enterprise admin dashboard, audit/share administration, suspension, searchable share recipient UX, and RTL admin shell refinements.

Operational prerequisites still require deployment infrastructure: a real malware engine/queue worker, automated backup target, object-storage production configuration, SSO provider, search index, and full browser/integration execution against a production-like database.
