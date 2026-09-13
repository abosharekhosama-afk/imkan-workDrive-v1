# Implementation Record: B-P04-IDOR-LIVE

## Objective
Prove cross-tenant isolation against the real local MySQL database with no Prisma mocks.

## Suite
`backend/test/idor.live.integration.e2e-spec.ts`

## Setup
- Creates two dedicated organizations and admin users per run (`idor-live-{timestamp}-A/B`).
- Seeds Tenant A folder, uploaded file, trashed file, and share link through the live API.
- Uses `STORAGE_DRIVER=local` with a temp object root (no Docker).

## Coverage
Tenant B (JWT) is denied:
- folder read / rename / delete
- file download / rename / trash / restore
- upload into Tenant A folder
- upload-complete for Tenant A version
- share creation on Tenant A file
- root folder listing and search visibility

Tenant A retains:
- folder read, file download, rename, public share verify

Client override:
- `orgId` / `org_id` rejected on upload-request and upload-complete (403)

## Cleanup
Deletes shares, versions, files, folders, audit logs, users, and organizations created for the test orgs only.

## Tests executed
```powershell
cd backend
npx nest build
npm run test:e2e -- --testPathPatterns=idor.live.integration
```

## Status
PASS (18/18). Later closed under `docs/releases/PHASE-04-COMPLETION.md`.
