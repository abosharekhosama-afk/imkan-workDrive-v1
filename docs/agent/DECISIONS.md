# Decision Log

- **DEC-001**: MySQL 8.x selected as the primary relational database for metadata and relationships.
- **DEC-002**: Object Storage (S3-compatible) selected for binary file storage, isolated per tenant.
- **DEC-003**: JWT-based authentication selected for the API with server-side RBAC enforcement.
- **DEC-004**: Frontend framework defined as React (Next.js/Vite) adhering to IMKAN One Design System.
- **DEC-005**: Deduplication will only occur *within* a tenant to avoid cross-tenant security boundaries. Global deduplication is rejected.
- **DEC-006**: MySQL Full-Text Search selected over Elasticsearch for MVP to reduce infrastructure complexity.
- **DEC-007**: SSO Provider is marked as PROPOSED/PENDING DECISION.
- **DEC-009**: Org-level `users.role` remains ADMIN | MEMBER per MYSQL-SCHEMA-DESIGN. T-202 seed maps organizer and viewer to MEMBER until team-folder roles exist.
- **DEC-010**: Folder GET uses `findFirst` (not `findUnique`) so tenant `orgId` can be applied; missing or cross-tenant folders return 404.
- **DEC-011**: Windows local object storage defaults to `STORAGE_DRIVER=local` (HMAC-signed `PUT/GET /storage/objects`). The S3-compatible adapter remains for `STORAGE_DRIVER=s3`. Docker/MinIO is not used.
- **DEC-012**: Phase 05 Team Folder ACL: resources with `teamFolderId` default DENY unless org ADMIN or `team_folder_members` role grants the action. Personal resources (`teamFolderId` null) keep Phase 04 same-org read and owner/admin write. Create Team Folder is org ADMIN only (F-201 Organizer does not exist at OrgRole). Unauthorized existence is 404; action denied after canRead is 403. `isPublicToOrg` does not grant access. SSO/login remain out of scope. Spec: `specs/001-team-folders-acl/`.
