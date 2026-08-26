# Implementation Record: T-302 GET /folders/:id

## Objective
Fetch a folder by id under tenant scope.

## Files
- `backend/src/folders/folders.controller.ts` (`GET /folders/:id`)
- `backend/src/folders/folders.service.ts` (`findFirst` + NotFoundException)

## Security
Uses `findFirst` so Prisma tenant `orgId` scope can hide other tenants. Cross-tenant ids return 404, not 403.

## Tests executed
FoldersService getById missing folder: 1 passed (Prisma mocked).

## Tests not executed
Cross-tenant API test against two real orgs in MySQL: NOT RUN.

## Status
PASS (unit). Integration BLOCKED on MySQL.
