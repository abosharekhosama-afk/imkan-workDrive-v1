# Implementation Record: T-201 JWT Auth

## Objective
Server-side JWT guard that requires a verified token and `org_id`, plus Prisma tenant query scoping.

## Files
- `backend/src/auth/jwt-auth.guard.ts`
- `backend/src/auth/jwt-auth.guard.spec.ts`
- `backend/src/auth/auth.module.ts`
- `backend/src/auth/public.decorator.ts`
- `backend/src/auth/jwt.types.ts`
- `backend/src/auth/tenant-context.ts`
- `backend/src/auth/tenant-context.interceptor.ts`
- `backend/src/prisma/apply-org-scope.ts`
- `backend/src/prisma/apply-org-scope.spec.ts`
- `backend/src/prisma/prisma.service.ts`

## Security
- Missing bearer token → 401
- Token signed with a different secret → 401
- Token without `org_id` → 401
- Valid token attaches `sub` and `org_id`
- Request interceptor stores tenant in AsyncLocalStorage for the request lifetime
- Prisma `$extends` appends `orgId` to tenant-scoped reads/writes and overwrites `orgId` on create
- `GET /` remains `@Public()`

## Tests executed
`npx jest --runInBand --testPathPatterns="jwt-auth.guard.spec|apply-org-scope.spec|..."`  
JwtAuthGuard: 4 passed. applyOrgScope: 3 passed (includes create orgId overwrite).

## Status
PASS (unit). API/e2e against live MySQL: NOT RUN.
