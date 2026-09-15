# Workflow V17.1 — UX & Feature Completion

## Base
Built on `imkan-workDrive-v1-2-zoho-workflow-v17-custom-functions-fixed.zip`.

## Implemented
- Unified Workflow visual language around the existing top **New** button: workflow action buttons now share the same blue, 10px radius, 40px height, typography, hover and disabled behavior.
- Workflow cards were unified toward the same visual language as the **New** modal: white surface, 18px radius, border and elevated shadow.
- Added a centralized `WorkflowHelp` registry covering list, builder, fields, state, transition, conditions, actions, participants, SLA, versions, runs, tasks, templates, functions, diagnostics, queue, audit and dynamic values.
- Help is contextual: the builder inspector changes between State and Transition guidance.
- Added **Queue Center** at `/files/workflows/queue`, backed by real `WorkflowJob` records with status, attempts, max attempts, priority, lease/run time and last error.
- Added **Audit Center** at `/files/workflows/audit`, backed by real organization-scoped `AuditLog` records and actor metadata.
- Added **Dynamic Values** browser at `/files/workflows/dynamic-values`, backed by the existing dynamic-value catalog endpoint, with one-click copy of `{{...}}` expressions.
- Added navigation entries for Queue, Audit and Dynamic Values.
- Added backend endpoints `GET /workflows/queue` and `GET /workflows/audit` with organization scoping and bounded result sets.
- Added responsive behavior for the new pages using the existing Workflow mobile shell and horizontal table scrolling.
- Preserved the existing Workflow engine, versioning, Data Templates, Safe Functions, Conditions, Participants and SLA runtime foundations.

## Validation
- Source-level route/API/import checks completed.
- Full `npm run build` / `typecheck` was **not certified in this environment** because both frontend and backend `node_modules` are absent and package installation timed out previously. No claim of a production build pass is made.

## Known boundaries
- Queue Center is an operational viewer; retry/dead-letter mutation remains intentionally tied to the existing run retry flow.
- Audit Center exposes existing audit metadata; a dedicated visual diff editor for arbitrary JSON configuration is not introduced here.
- Dynamic Values is a visual catalog/copy browser, not a full property-tree picker embedded into every input.
