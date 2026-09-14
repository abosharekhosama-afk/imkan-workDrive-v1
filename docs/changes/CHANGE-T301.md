# Implementation Record: T-301 POST /folders

## Objective
Create folder API with tenant ownership from JWT, not from the request body.

## Files
- `backend/src/folders/folders.controller.ts`
- `backend/src/folders/folders.service.ts`
- `backend/src/folders/folders.module.ts`
- `backend/src/folders/create-folder.schema.ts`
- `backend/src/folders/create-folder.schema.spec.ts`
- `backend/src/folders/folders.service.spec.ts`

## API
`POST /folders` (authenticated)
Body: `{ name, parentId?, teamFolderId? }`
`orgId` in the body is ignored. `orgId` and `ownerId` come from the JWT.

## Tests executed
parseCreateFolder: 2 passed. FoldersService create: 1 passed (Prisma mocked).

## Tests not executed
Live MySQL / Supertest e2e: NOT RUN (database not applied).

## Status
PASS (unit). Integration BLOCKED on MySQL.
