# Database Governance

Database: MySQL 8.x

## Requirements
- versioned migrations
- transactional integrity
- appropriate indexes
- foreign keys where appropriate
- tenant isolation
- auditability
- safe migrations
- no silent schema changes
- no destructive migration without explicit approval
- exact numeric types where required
- UTC/timezone strategy must be documented before implementation

## Canonical organization model
Users are global identities. Organization membership is represented only by `OrganizationMembership`, with `user_id`, `organization_id`, `role`, status, and primary-context metadata. `User` deliberately has no `org_id` and no organization role. `Organization.owner_id` references `users.id` for ownership, but ownership does not replace membership authorization. `User.currentOrganizationId` is a switcher hint only and must always be validated against an active membership.

## Organization isolation
Every organization-scoped query must use the authenticated tenant context (`org_id`) and must validate target users through active `OrganizationMembership` rows. Resources such as folders, files, shares, team folders, activity, quotas, and enterprise policy retain their own `org_id`; cross-organization lookups must not rely on a User organization column.

## Seed and migration governance
Seed order is: organization; users; organization owner; memberships; team folder; personal folders; files and versions; shares; notifications/comments; favorites/tags; quota. This ensures all foreign keys are valid and permits an idempotent rerun. The development repair migration removes legacy `users.org_id` and `users.role`; it is followed by current-organization context and membership/foundation migrations. Do not reintroduce either legacy User field.

## File Binaries
Do NOT store normal file binaries directly in MySQL.
Use an object-storage abstraction / S3-compatible storage.
MySQL stores metadata, references, state, permissions, and related relational data.

## Repair validation
Validated with Prisma 6.19.3: schema validation, client generation, reset, seed (including repeat execution), and TypeScript compilation pass. Jest/build validation should be rerun as part of release CI; the Prisma package configuration deprecation warning is tracked for the Prisma 7 config migration.

## Canonical Organization Membership Model (Database Repair)

The enterprise tenancy model is now explicitly:

`User -> OrganizationMembership -> Organization`

`User` is a global identity and intentionally does not contain a legacy `org_id` or organization-scoped `role`. Organization membership, organization role, membership status, and primary-organization state are owned by `OrganizationMembership`.

Organization-scoped resources keep their own `org_id` boundary (`folders`, `files`, `team_folders`, shares, audit/security records, sessions, quotas, etc.). This prevents a global User row from becoming the tenant boundary.

`users.current_organization_id` is only a convenience pointer for the user's selected workspace. It is never used as authorization. Every authenticated request is authorized through the active `OrganizationMembership` for the JWT tenant claim.

The JWT `role` is a derived claim. The JWT guard refreshes it from the current membership record so membership role changes are enforced without trusting a stale role claim.

### Member departure and ownership transfer

Removing a member revokes that organization's sessions, marks the membership `REMOVED`, clears the removed membership's personal-folder pointer, and moves the user's current-organization pointer to another active membership when one exists. Personal files/folders require a successor when ownership must be transferred. Team-folder content remains organization/team-folder content and is not deleted as a side effect of member departure. `DataTransfer` records the ownership transfer operation and its progress.

### Seed ordering

Organization is created before users are assigned as owner; users are created before membership; memberships are created before personal/team folders and organization resources. Seed IDs remain deterministic and the seed is expected to be idempotent.
