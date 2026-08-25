# Organization & Collaboration Implementation

This release extends the existing IMKAN WorkDrive implementation without redesigning the existing UI.

## Implemented

- Organization management API: read/update organization.
- Organization member listing, role changes, and safe member removal.
- Organization invitations with hashed single-use tokens, expiry, revoke and accept flows.
- Signup through an organization invitation.
- Organization administration page using the existing IMKAN/WorkDrive visual components.
- Invitation acceptance page.
- Shared-with-me resource metadata now includes resource name and owner.
- Shared-by-me resource metadata now includes resource name and recipient details.
- Share recipient permission update.
- Share recipient removal.
- Share revocation.
- Audit events for organization membership and sharing changes.
- Existing Team Folder membership and permission architecture retained.

## Database

Added `organization_invitations` migration:
`backend/prisma/migrations/20260824180000_organization_collaboration/migration.sql`

## API surface

- `GET /organization`
- `PATCH /organization`
- `GET /organization/members`
- `PATCH /organization/members/:id`
- `DELETE /organization/members/:id`
- `GET /organization/invitations`
- `POST /organization/invitations`
- `DELETE /organization/invitations/:id`
- `POST /organization/invitations/accept`
- `GET /organization/invitations/validate?token=...`
- `PATCH /shares/:id/recipients/:userId`
- `DELETE /shares/:id/recipients/:userId`
- `DELETE /shares/:id`

## Production notes

The repository does not contain an outbound email provider. Invitation creation therefore returns a signed invitation URL so an existing mail delivery service can deliver it. The invitation itself is persisted securely using a SHA-256 token hash and expires after seven days.

No fake file, organization, sharing or permission API was introduced.
