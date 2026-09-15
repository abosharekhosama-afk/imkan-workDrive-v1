# Workflow V18 — Render/Prisma Deployment Fix Report

## Incident
Render failed before application compilation during `npx prisma generate` with Prisma P1012 schema validation errors.

### Error 1 — User ↔ WorkflowFunctionExecution
`User.workflowFunctionExecutions` declared a relation, but `WorkflowFunctionExecution` has no `userId`/User relation field. The field was removed from `User`; the valid organization/function/version relations remain intact.

### Error 2 — Workflow.activeVersion ↔ WorkflowVersion.activeFor
`Workflow.activeVersion` is a one-to-one relation because one Workflow has one active version and each WorkflowVersion belongs to exactly one Workflow. Prisma therefore requires the defining scalar `Workflow.activeVersionId` to be unique. `@unique` was added and a matching SQL migration was added.

## Changes
- Removed invalid `User.workflowFunctionExecutions` relation.
- Added `@unique` to `Workflow.activeVersionId`.
- Added migration:
  `20260915130000_fix_workflow_version_relation/migration.sql`
- Migration creates `workflows_active_version_id_key` unique index.

## Deployment impact
The failure occurred at Prisma schema validation, before `prisma migrate deploy` and before `npm run build`. These fixes target the exact blocking P1012 errors.

## Verification
Source-level checks confirm:
- `User` no longer declares the invalid execution relation.
- `Organization.workflowFunctionExecutions` remains valid for `WorkflowFunctionExecution.orgId`.
- `Workflow.activeVersionId` is unique.
- The new migration creates the corresponding unique index.

A full `prisma validate` could not be executed in this offline working environment because the archive does not contain `node_modules` and installing dependencies timed out. Therefore this report does **not** claim a local Prisma validation/build pass.

## Render expectations
The existing build command can remain:

`npm install && npx prisma generate && npx prisma migrate deploy && npm run build`

The Prisma deprecation warning for `package.json#prisma` and the npm audit vulnerabilities are warnings, not the cause of this deployment failure.
