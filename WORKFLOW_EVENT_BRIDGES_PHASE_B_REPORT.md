# IMKAN WorkDrive — Workflow Event Bridges Phase B

## Base

This phase is cumulative on the latest `imkan-workDrive-v1-2-new-recording-workflow-actions` build plus Phase A Workflow Security Hardening. Existing Personal Files, Team Folder, Sharing and Authentication permission code is intentionally preserved.

## Implemented

1. File workflow event payloads now explicitly carry `resourceType: FILE` and parent `folderId` context.
2. Existing real file bridges remain intact for move, copy, rename and delete.
3. Existing real folder bridges remain intact for create, move, copy and rename with `resourceType: FOLDER`.
4. The real `mark_final` / `archive` workflow action now emits the `ready` workflow trigger after the resource is archived.
5. Added regression tests for the event-bridge contracts and ready trigger.
6. Phase A server-side Workflow authorization changes are retained in the cumulative source set.

## Intentionally not faked

`properties_updated` was not emitted from an unrelated operation. The current application does not yet expose a real file/folder data-template property mutation endpoint, so this trigger remains pending until such a mutation path exists.

A separate `folder uploaded` event was also not invented because the current folder upload operation is not a distinct backend resource event; folder creation/upload-tree semantics need a real backend contract first.

## Validation

Source-level inspection and deterministic contract tests were added. Full dependency-backed Jest/build/Prisma/E2E certification still requires the project's dependencies and a live staging database/worker environment.
