# Change Report — Workflow Execution Engine

**Date:** 2026-09-12  
**Status:** Implemented — validation pending in a dependency-complete environment.

## Delivered

- Added `WorkflowRun` persistence with a unique `(workflow_id,event_key)` guard for idempotent execution.
- Added a real backend execution service for active upload workflows.
- Upload completion now emits an internal workflow event after the successful database transaction.
- Implemented conditions: `any`, `PDF`, `IMAGE`.
- Implemented actions: `notify` and `favorite` using existing production database models.
- Workflow failures are recorded without rolling back the successful upload.
- Workflow execution writes an audit record.
- Added `scope=mine` to the workflow API and connected the secondary sidebar's “My Workflows” view to it.
- Removed the unimplemented `move` action from the creation UI rather than presenting a fake capability.

## Important limitation

This is the first real execution slice, not a generic automation engine. Only the `upload` trigger and the two implemented actions are executable. Other trigger/action types must be added with explicit persisted configuration and tests before being exposed in UI.

## Validation

The project dependencies were not available for a complete NestJS/Prisma build in this environment, so `prisma validate`, generation, full backend tests, and production build remain pending. The MySQL migration was written for the project's existing MySQL Prisma datasource.
