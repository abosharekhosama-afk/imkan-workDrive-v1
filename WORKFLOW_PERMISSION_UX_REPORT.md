# Workflow Permission + UX Completion Report

## Scope
This release changes **Workflow only**. Existing personal-file permissions, Team Folder roles, sharing permissions, authentication, and the existing Files UI behavior were intentionally left in place.

## What was implemented
- Added a tenant-scoped Workflow domain with workflows, states, transitions, runs, and approval tasks.
- Added strict Workflow authorization: only organization `ADMIN` can create, list/manage, activate/deactivate, and run workflows; regular members can only see and act on tasks assigned to themselves.
- Added automatic `FILE_UPLOADED` workflow trigger after a successful file upload. Workflow failures are isolated so they cannot break the existing upload path.
- Added workflow task approval/rejection with server-side assignee checks and run state transitions.
- Added Workflow navigation without changing the existing top bar or New button.
- Added role-aware Workflow UI: members see only `My Tasks`; admins see `My Tasks`, `My Workflows`, and `Workflow Administration`.
- Added Workflow administration counters and creation of automatic file approval workflows.
- Reused the existing Files/Zoho visual language: Arial typography, existing `zoho-ghost-btn`, existing `var(--wd-*)` colors, borders, surfaces, radii, and spacing language.
- Added organized cards, consistent spacing, responsive mobile layout, and compact workflow states.

## Security model
- Every Workflow query is scoped by `orgId` from the authenticated JWT.
- Workflow management checks the authenticated organization role server-side.
- Workflow ownership is checked before mutation/run operations.
- Task decisions require the authenticated user to be the exact task assignee and task status must still be `PENDING`.
- Workflow resource type is checked before a run is created.
- Assignees are validated against active organization membership data represented by the users table.
- No client-side role check is treated as an authorization boundary.

## Intentionally untouched
- Personal-file permission model.
- Team Folder permission model and roles.
- Existing sharing behavior.
- Existing authentication/session validation.
- Existing Files top bar, New button, file cards, and file operations.
- Existing non-Workflow routes and backend modules.

## Affected files
### Backend
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260915170000_workflow_permissions/migration.sql`
- `backend/src/app.module.ts`
- `backend/src/files/files.module.ts`
- `backend/src/files/files.service.ts`
- `backend/src/workflows/workflows.module.ts`
- `backend/src/workflows/workflows.controller.ts`
- `backend/src/workflows/workflows.service.ts`

### Frontend
- `frontend/src/components/workdrive-nav.tsx`
- `frontend/src/app/globals.css`
- `frontend/src/lib/api/workflows.ts`
- `frontend/src/app/files/workflows/page.tsx`
- `frontend/src/app/files/workflows/tasks/page.tsx`
- `frontend/src/app/files/workflows/mine/page.tsx`
- `frontend/src/app/files/workflows/mine/[id]/page.tsx`
- `frontend/src/app/files/workflows/admin/page.tsx`

## Validation status
- Source files and paths were inspected after modification.
- The project does not contain installed `node_modules` in the supplied snapshot, so a full Next.js/NestJS build, Prisma client generation, live migration, and browser E2E were **not certified** here.
- `npx prisma validate` could not be completed in the available environment because dependency installation/tool resolution timed out.
- Therefore this report does not claim a successful production build or live database migration.

## Deployment requirement
Run the normal Prisma migration/deploy flow in the target environment, then generate Prisma Client and run backend/frontend typecheck/build plus E2E tests before production rollout.
