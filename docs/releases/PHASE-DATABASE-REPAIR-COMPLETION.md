# Phase: Database Repair Completion
## Root cause
`User` had previously been organization-owned through `users.org_id` and carried a duplicated role. The enterprise model now uses `OrganizationMembership` for both organization association and organization role. The schema and corrective migrations already remove those legacy columns; seed code was aligned to create the owner only after users and to create memberships before resources.

## Canonical model
`User -> OrganizationMembership -> Organization` is the sole membership boundary. `Organization.owner_id` points to a user, while every organization-scoped resource retains its own `org_id`. `User.currentOrganizationId` is context only and is not membership or authorization.

## Changes
- Confirmed Prisma schema has no `User.orgId` or `User.role`.
- Preserved corrective migration `20260827000000_remove_user_org_id_and_role` and membership migration `20260827000002_add_organization_membership_and_missing_tables`.
- Kept Database V2 entities: versions, storage objects, metadata, activity, tags, shares, favorites, quotas, and enterprise foundation.
- Seed ordering is organization, users, owner, memberships, team folder, personal folders, file/versions, share, notification/comment, favorite/tag, quota.
- Updated S3 presign test typing and membership-based live team-folder fixtures.
- Updated permission tests/logic to retain owner-only personal access and role-based team-folder access.

## Validation
- `npx prisma validate` passed.
- `npx prisma generate` passed with Prisma 6.19.3.
- `npx prisma migrate reset --force --skip-seed` passed.
- `npx prisma db seed` passed twice (idempotent).
- `npx tsc --noEmit` passed.
- Full Jest run remains to be completed after final fixture alignment; remaining failures are mock-contract/permission test expectations, not Prisma schema errors.

## Runtime Canonical Membership Repair
- **Root cause:** runtime authentication code or stale fixtures treated `User` as organization-owned, although Prisma now correctly models membership through `OrganizationMembership`.
- **AuthService fix:** `AuthService.me()` first requires an `ACTIVE` membership matching both `user.sub` and `user.org_id`, selects the membership role from that row, then fetches the user separately by `id` only. No User organization or role field is queried.
- **Security validation:** the tenant identity is not returned until the user/organization pair is validated through the active membership boundary. JWT session validation performs the same active-membership check.
- **Files changed:** `backend/src/auth.service.ts`, authentication guard fixtures, membership-based integration fixtures, and related runtime tests/documentation.
- **Tests executed:** Prisma validation/generation/reset/seed/status and `npx tsc --noEmit` passed. Jest was rerun while aligning existing service mocks; remaining failures are tracked below.
- **Build result:** `npm run build` was invoked but did not complete within the execution timeout; completion must be confirmed in CI or a full local run.

## Remaining warning
Prisma reports the existing deprecated `package.json#prisma` seed configuration; it should be moved to `prisma.config.ts` before Prisma 7. Full Jest and build gates remain outstanding and this document does not claim final release completion until they pass.
