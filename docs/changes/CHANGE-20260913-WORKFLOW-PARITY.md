# IMKAN WorkDrive — Workflow Engine Parity Phase

Date: 2026-09-13

## Objective

Upgrade the WorkDrive workflow feature from a simple trigger/condition/action prototype into a real workflow platform modeled on the **functional architecture** of Zoho WorkDrive Workflows: automatic/manual workflows, file/folder resource types, states, transitions, human approval tasks, multiple actions, durable execution jobs, retries, failure/dead-letter state, and execution history.

Zoho's public WorkDrive documentation describes workflows around four core concepts: triggers, states, transitions, and actions; it also supports file/folder workflow types, automatic/manual workflows, multiple actions per state/transition, and workflow tasks requiring user action. This implementation follows those functional concepts without copying Zoho branding or proprietary UI/assets.

## Implemented

### Workflow definition
- Automatic and manual workflow modes.
- File-based and folder-based workflows.
- Workflow description and owner metadata.
- Up to 20 states.
- State descriptions and terminal states.
- Workflow transitions with names, conditions and action arrays.
- Up to 5 actions per transition.
- Backward-compatible trigger/condition/action representation retained in `WorkflowStep`.

### Real triggers
- File uploaded.
- File created.
- File moved.
- File copied.
- File properties updated/renamed through existing file/folder mutation paths.
- Folder created.
- Folder moved.
- Folder copied.
- Manual workflow start endpoint.

### Real actions
- Notify selected organization users.
- Favorite a file.
- Add a tag.
- Archive/mark-final equivalent using the existing WorkDrive archived lifecycle state.
- Move a file to a selected destination folder.
- Copy a file to a selected destination folder.
- Share a file through the existing Share service.
- Request human approval and create a real workflow task.

Actions that are not supported by the existing WorkDrive domain model are not faked.

### Execution infrastructure
- Durable `workflow_jobs` database queue.
- Worker polling and job claiming.
- Attempt counter.
- Exponential retry/backoff.
- Maximum attempts.
- `DEAD` job state after retry exhaustion.
- Run states including `QUEUED`, `RUNNING`, `WAITING`, `SUCCEEDED`, and `FAILED`.
- Step-level execution history in `workflow_step_runs`.
- Existing workflow event idempotency retained.

### Human workflow
- `workflow_tasks` persistence.
- Assignee support.
- Waiting-for-action page.
- Transition completion endpoint.
- Workflow continuation after a completed transition.
- Notifications for approval requests.

### Administration/UI
- Real workflow builder page.
- Workflow edit page.
- State management.
- Automatic/manual mode selection.
- File/folder workflow selection.
- Trigger/condition/action configuration.
- Workflow list with active/draft state.
- Run history.
- Waiting-for-action navigation.
- EN/AR localization for new UI.

### Auditing
Workflow create, update, activate, deactivate, delete, and execution events are recorded in the existing security audit log.

## Database migration

`backend/prisma/migrations/20260913100000_workflow_engine/migration.sql`

Adds:
- workflow metadata columns;
- workflow states;
- workflow transitions;
- durable workflow jobs;
- workflow tasks;
- workflow step runs;
- workflow run current-state tracking and indexes.

## Verification status

Source-level checks completed:
- EN JSON parses.
- AR JSON parses.
- Workflow UI contains no placeholder/API-fake implementation.
- Workflow backend files and migration are present.

Full `npm ci`, Prisma validation/generation, Nest build, and automated test suites were **not completed in this environment** because dependency installation/registry access timed out. Therefore this package must be run through the project's normal dependency installation and test/build pipeline before being called production-ready.

## Important boundary

This is **functional parity work**, not a visual or branding clone of Zoho WorkDrive. The project's design rules explicitly require IMKAN One visual identity while using Zoho WorkDrive as a functional/UX reference.

The implementation does not claim parity with every Zoho integration, custom-function ecosystem, Zoho Office editor integration, or every proprietary backend behavior. Those would require separate, real integrations rather than fabricated placeholders.
