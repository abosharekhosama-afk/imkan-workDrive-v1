# IMKAN WorkDrive — V11 Phase 4 / Real Project Status Report

Date: 2026-09-14
Base: IMKAN WorkDrive V10 Phase 3

## 1. Executive verdict

V11 is a real incremental engineering release on top of V10, not a visual mock-up. The workflow system now has:

- persistent workflow versions and version-bound runs;
- nested AND/OR conditions;
- user/group/role participants;
- ANY/ALL approval behavior;
- due dates, reminders and escalation;
- business-calendar-aware SLA calculation for workflow tasks;
- reusable data-template records and a real `data_template` runtime action;
- a safe, allow-listed custom-function runtime rather than arbitrary code execution;
- a database-backed job queue with stale-lock recovery;
- an optional separate worker entry point;
- default workflow templates that can be created per organization;
- regression tests covering the new Phase 4 contracts;
- mobile/desktop UX from V8 and the V9/V10 workflow capabilities retained.

This is materially closer to a production workflow product than V8. It is still **not Zoho WorkDrive parity and should not be presented as production-equivalent to Zoho yet**.

## 2. What was actually changed in V11

### Workflow runtime

1. `data_template` action
   - Loads a reusable template by ID or accepts inline template text.
   - Resolves supported dynamic values.
   - Can write the rendered result into a workflow field.

2. `custom_function` action
   - Supports only registered safe functions:
     - `set_workflow_field`
     - `notify_owner`
     - `tag_from_extension`
   - Arbitrary JavaScript, shell commands, `eval`, or user supplied executable code is deliberately not allowed.

3. Business calendar
   - Workflow stores working days, working hours and holidays.
   - SLA due/reminder calculations skip configured non-working days and outside working hours.
   - The configured timezone is stored and exposed, but the current calculation still uses the server's Date/Time basis. Timezone-aware arithmetic is therefore an explicit remaining gap.

4. Queue reliability
   - Existing DB-backed jobs remain the source of truth.
   - A job stuck in `RUNNING` for more than five minutes is recovered to `QUEUED`.
   - `backend/src/workflow-worker.ts` provides a separate worker process entry point.
   - `backend` now exposes `npm run workflow:worker`.

5. Version correctness
   - Job execution now prefers the exact `WorkflowVersion` recorded on the run instead of silently using the current draft/active definition.
   - This protects running executions from later workflow edits.

### Backend API

Added:

- `GET /workflows/templates`
- `POST /workflows/templates`
- `GET /workflows/functions`
- `POST /workflows/functions`
- `POST /workflows/defaults/ensure`

### Database

Added migration:

`backend/prisma/migrations/20260914203000_workflow_phase4/migration.sql`

Added:

- `Workflow.calendarConfig`
- `Workflow.isSystemDefault`
- `WorkflowDataTemplate`
- `WorkflowFunction`

### Builder UI

The existing V8/V9/V10 visual design was retained.

Added:

- Data Template action configuration.
- Safe Custom Function action configuration.
- Business calendar controls for timezone, working hours and working days.
- Existing mobile inspector, drag/reorder behavior and desktop canvas remain intact.

## 3. Current workflow capability matrix

| Capability | Current state | Reality level |
|---|---|---|
| Workflow CRUD | Implemented | Real backend |
| Automatic/manual triggers | Implemented | Real backend |
| States/transitions | Implemented | Real backend |
| Before/During/After actions | Implemented | Real backend |
| File/folder actions | Implemented | Real backend |
| Conditions | Nested AND/OR implemented | Good, not full Zoho parity |
| Custom workflow fields | Implemented | Real backend, JSON-backed |
| Dynamic values | Implemented | Limited variable catalog |
| Participants | User/group/role | Real backend |
| ANY/ALL approval | Implemented | Real backend |
| Due/reminder | Implemented | Real backend |
| Escalation | Implemented | Basic |
| Business calendar | Implemented | Basic; timezone arithmetic remains |
| Versioning | Implemented | Real immutable snapshots |
| Run history | Implemented | Real backend |
| Retry/dead jobs | Implemented | DB-backed |
| Separate worker process | Added | Available, needs deployment validation |
| Data Templates | Added | Text/JSON-style rendering, not document generation |
| Custom Functions | Added | Safe allow-list only |
| Default workflow templates | Added | Created as drafts |
| E2E production verification | Not complete | Environment limitation |

## 4. Important limitations that remain

### A. Custom Functions are intentionally not arbitrary code

V11 does **not** provide a server-side JavaScript/Python execution sandbox. That is intentional for security. The current implementation is a controlled function registry.

To reach enterprise-grade Custom Functions, the next implementation should use an isolated execution service/sandbox with:

- timeouts;
- CPU/memory limits;
- network allow-listing;
- secrets isolation;
- per-organization permissions;
- execution logs;
- retries and dead-letter handling.

### B. Data Templates are not yet a full document-template engine

V11 supports reusable text templates and dynamic value substitution. It does not yet generate Word/PDF/HTML documents with a full template language.

### C. Business calendar is incomplete

Working days/hours/holidays are respected by the SLA calculator, but the configured timezone is metadata rather than a fully timezone-aware calculation layer.

### D. Queue is more reliable, but not yet a distributed job platform

The queue is persisted in MySQL and can be processed by a separate worker process. It does not yet have:

- dedicated distributed locking with database-specific row locking strategy;
- dead-letter inspection UI;
- operational metrics;
- queue backpressure;
- worker health/heartbeat;
- horizontal worker coordination tests.

### E. Default workflows are templates, not complete Zoho system workflows

The new endpoint creates three organization-level draft templates. They are not yet a full catalog of Zoho's system/default workflows, nor are they automatically enabled.

### F. Audit is still below enterprise workflow audit depth

Run logs and workflow activation/deactivation audit exist. A full configuration audit trail with field-level diffs, actor, reason, before/after snapshots and retention policy is still missing.

## 5. Realistic Zoho parity assessment

This is an engineering assessment based on the implemented source and the Zoho workflow behavior already researched for this project; it is not a vendor certification.

### Workflow UX / functional core

Approximately **70–80%** of the important workflow-builder concepts are now represented:

- fields;
- trigger;
- states;
- transitions;
- actions;
- conditions;
- participants;
- approval policy;
- SLA;
- versions;
- execution history.

The remaining gap is concentrated in advanced enterprise capabilities rather than the basic state-machine model.

### Production readiness

Approximately **55–65%** for the workflow subsystem, because the main missing evidence is operational verification rather than just UI work:

- real DB migration execution;
- Prisma client generation;
- production build;
- integration/E2E execution;
- concurrency testing;
- failure/recovery testing;
- worker deployment validation;
- security testing of workflow actions.

These percentages are intentionally ranges. They should not be interpreted as automated test coverage or a formal compatibility score.

## 6. Overall IMKAN WorkDrive status

The project is no longer at the “UI prototype” stage.

The file-management layer already contains substantial real backend functionality around files, folders, versions, sharing, permissions, notifications, audit/security areas and workflow integration. The workflow subsystem is now a genuine stateful automation layer connected to file/folder events.

However, the project is also not ready to claim “Zoho WorkDrive replacement” status.

The largest project-wide remaining risks are:

1. production verification and automated test depth;
2. distributed/background job operations;
3. enterprise-grade security hardening;
4. richer sharing/permissions edge cases;
5. complete workflow audit/version diffing;
6. robust timezone/calendar semantics;
7. isolated Custom Function execution;
8. richer Data Template/document generation;
9. broader default/system workflow catalog;
10. observability, metrics and operational administration.

## 7. Recommended next stage

The next stage should **not** be another cosmetic redesign.

Priority order:

### V12 — Production hardening

- install/generate Prisma client in a real environment;
- execute migrations against MySQL;
- run backend build;
- run unit + integration + E2E suites;
- add concurrency tests for job claiming;
- add task/approval race-condition tests;
- add worker heartbeat/health;
- add dead-letter/admin tooling;
- add structured workflow telemetry.

### V13 — Enterprise workflow capabilities

- timezone-correct business calendars;
- holiday calendars per organization;
- richer SLA escalation policies;
- participant substitution/delegation;
- group/role resolution snapshots;
- configuration audit diff;
- workflow import/export with schema validation.

### V14 — Advanced automation

- isolated Custom Function sandbox;
- full Data Template engine;
- richer dynamic-value picker;
- external integrations/webhooks;
- more sophisticated conditions and event payloads.

## 8. Verification status

Source-level inspection was completed after the V11 changes and the changed-file set was compared against V10.

Changed implementation areas:

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260914203000_workflow_phase4/migration.sql`
- `backend/src/workflows/workflow-engine.service.ts`
- `backend/src/workflows/workflows.service.ts`
- `backend/src/workflows/workflows.controller.ts`
- `backend/src/workflows/workflow-phase4.spec.ts`
- `backend/src/workflow-worker.ts`
- `backend/package.json`
- `frontend/src/app/files/workflows/builder/page.tsx`
- `frontend/src/lib/api/workflows.ts`

The project currently has no installed `node_modules` in the supplied build environment. Therefore:

- `npm build` was **not claimed as passed**;
- Prisma client generation was **not claimed as passed**;
- database migration was **not claimed as executed**;
- E2E tests were **not claimed as passed**.

The added regression tests are present in source, but their execution also requires the project's dependencies.

## 9. Final verdict

**V11 is a meaningful engineering step forward.** It closes several gaps identified in the V10 report: reusable templates, safe custom functions, business-calendar SLA semantics, stronger job recovery, a separate worker entry point and default workflow templates.

The most important truth is that the remaining gap is now increasingly about **production engineering, security, observability and enterprise semantics**, not basic workflow UI.

The project should proceed to V12 production hardening before adding another large layer of workflow features.
