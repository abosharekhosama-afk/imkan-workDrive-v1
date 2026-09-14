# Implementation Record: T-801 Audit listing

## Objective
Expose tenant-scoped activity logs. Writes already exist on upload/download/share/rename/trash/restore; this slice adds read API and UI.

## Endpoint
`GET /audit` (JWT required)

- Admin: all `audit_logs` for JWT `org_id`
- Member/viewer: same tenant, `actorId = sub` only
- Client `orgId` is not accepted

## UI
`/files/activity` content region (no extra shell). Strings via i18n.

## Tests executed
- `npx nest build` — success
- `jest --testPathPatterns="audit-access.spec|audit.service.spec"` — 2 suites, 5 passed
- `npx tsc --noEmit` — success
- `node --test --experimental-strip-types src/lib/api/audit-path.spec.ts` — 1 passed

## Not run
Search, trash, Docker, MySQL, MinIO, next build.

## Status
PASS (unit). Phase 04 remains IN_PROGRESS.
