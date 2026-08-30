# Database / Organization Model Repair

## Scope

This repair aligns the MySQL/Prisma schema, backend authorization model, member lifecycle, and frontend organization context around the canonical model:

`User -> OrganizationMembership -> Organization`

## Changes implemented

- Removed legacy `User.orgId` and `User.role` assumptions from the canonical Prisma model.
- Kept `User.currentOrganizationId` only as a selected-workspace convenience pointer.
- Organization role is owned by `OrganizationMembership`.
- JWT authorization refreshes the role from the current active membership.
- Organization membership is verified for every authenticated tenant request.
- Organization member removal revokes tenant sessions and prevents the removed user's current-organization pointer from remaining on the removed tenant.
- Personal ownership transfer is represented by `DataTransfer` and archived-member folders.
- Invitation acceptance creates the membership and personal folder transactionally.
- Frontend organization context supports switching between active memberships.
- Frontend organization/admin role handling recognizes `SUPER_ADMIN` as well as `ADMIN`.

## File and team-folder model

- Personal files are organization-scoped files owned by the User and stored under the member's personal folder.
- Team-folder files remain organization/team-folder content even when their uploader/previous owner leaves.
- File versions and storage objects remain attached to the organization and logical file.
- Shares, comments, tags, favorites, activity, quota, and audit data remain organization-scoped.

## Validation

The source repository already contained a repaired migration history and seed implementation. This pass also updates runtime authorization and member lifecycle behavior. Full dependency installation/build execution was attempted in the isolated environment but was limited by the available execution timeout; therefore this document does not claim a fresh full-suite pass from this environment.
