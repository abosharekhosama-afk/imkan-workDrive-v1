# IMKAN WorkDrive — Workflow Security Hardening Phase A

Date: 2026-09-15

## Scope

This phase implements the first security-hardening tranche from the current WorkDrive audit. It is intentionally limited to the Workflow subsystem and does not modify the existing Personal Files or Team Folder permission model.

## Changes

### 1. Workflow administration is now server-gated

Organization `ADMIN` and `SUPER_ADMIN` are the only roles allowed to perform Workflow administration operations.

Protected areas include:

- Create / activate / deactivate / manage workflows
- Workflow operational queue inspection and actions
- Workflow audit and diagnostics
- Workflow data-template administration
- Workflow custom-function administration/testing
- Default workflow initialization

The authorization is enforced inside `WorkflowsService`, so direct API calls cannot bypass it by skipping the frontend UI.

### 2. Workflow visibility is narrowed

- Ordinary members see active workflows for discovery/start.
- Draft workflows are owner-scoped for members.
- Workflow details for drafts require owner/admin authorization.
- Version details/rollback are owner/admin scoped.
- Workflow runs are no longer organization-wide for ordinary members. Members can see runs they started, runs belonging to workflows they own, or runs associated with their workflow tasks/participation.
- Admins retain organization-wide workflow operational visibility.

### 3. Existing file/team permissions were not changed

No changes were made to `PermissionService`, Personal Files ACL rules, Team Folder roles, Sharing, Authentication, or storage authorization.

Manual workflow resource authorization remains in the existing Workflow Engine path, where the starter must have write access to the target resource.

## Modified files

- `backend/src/workflows/workflows.service.ts`
- `backend/src/workflows/workflow-authorization.spec.ts`

## Validation

A source-level TypeScript invocation was attempted. The environment does not contain the project's installed dependencies, so dependency resolution fails before a complete project typecheck can run. No production build, Prisma generation, database migration, or live E2E certification is claimed by this phase.

The new authorization contract has a focused regression spec covering ADMIN/SUPER_ADMIN vs MEMBER behavior.

## Next phase

After this security tranche, the next implementation target is the real file/folder Workflow event bridge matrix, followed by runtime action authorization and explicit Workflow Starter vs Workflow Creator execution identity.
