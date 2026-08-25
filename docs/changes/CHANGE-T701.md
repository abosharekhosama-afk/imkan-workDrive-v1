# Implementation Record: T-701 Trash and restore

## Objective
List soft-deleted files and restore them under tenant + write authorization.

## Endpoints
- `GET /files/trash` — files with `deletedAt` not null, `orgId` from JWT
- `POST /files/:id/restore` — clears `deletedAt`; viewer denied; cross-tenant 404
- UI: `/files/trash`

## Tests executed this turn
- `npx nest build` — success
- `npx jest --runInBand --testPathPatterns=files.trash-restore.spec` — 1 suite, 4 passed
- `npx tsc --noEmit` — success
- `node --test --experimental-strip-types src/lib/api/trash-path.spec.ts` — 1 passed

## Tests not re-run
Search specs, upload-file.spec, prior file lifecycle suites.

## Status
PASS (unit). Live MySQL/E2E: NOT RUN.
