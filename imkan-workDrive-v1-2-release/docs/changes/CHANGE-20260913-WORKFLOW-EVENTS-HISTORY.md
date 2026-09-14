# Phase 4 — Workflow Events & Execution History

Date: 2026-09-13

## Implemented

- Generalized the Workflow Engine from upload-only dispatch to typed file events.
- Added real triggers for upload, rename, move, and delete-to-trash.
- Preserved organization scoping and workflow-run idempotency.
- Added `GET /workflows/runs` with optional `workflowId` and `status` filters, capped at the latest 100 runs.
- Added a dedicated `/files/workflows/runs` UI with status filtering and success/failure details.
- Added bilingual EN/AR labels and a Workflow Run History entry in the secondary sidebar.
- Existing upload trigger remains compatible through `onFileUploaded`.

## Important behavior

Workflow execution is asynchronous and non-blocking relative to the file mutation. A successful file operation is not rolled back if an automation fails.

`ACTIVE` means the workflow is eligible for execution; it does not imply an external job queue or distributed worker. Execution currently occurs in-process through the backend service.

## Verification

- Source-level structural checks completed.
- EN/AR JSON parsed successfully.
- Full npm install/build/typecheck/test suite was not executed in this environment because the dependency installation/runtime database were not available.

## Next gate

Next recommended phase: expand workflow actions beyond notify/favorite, add configurable destinations/recipients, and move execution to a durable queue/outbox worker for production-grade retry/observability.
