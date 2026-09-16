# Workflow V6 — Zoho-style workflow system

This release is built from the latest uploaded project and targets the supplied Zoho WorkDrive workflow screenshots.

## UI
- Workflows management table with New workflow modal.
- Manual / Automatic creation mode.
- File-based / Folder-based workflow type.
- Three-step builder: Configure fields → Design workflow → Review.
- Workflow field palette and field editor.
- Visual state canvas with draggable states, SVG connectors, transition labels, branches, zoom and minimap.
- Transition inspector with Before / During / After phases.
- Per-phase instant actions with configuration.
- Activation confirmation and validation.
- Waiting-for-my-action drawer with workflow fields and transition selection.

## Runtime
- Automatic events create workflow runs only for matching active workflows.
- Starting conditions and transition conditions are evaluated against file/folder data and workflow field values.
- Workflow runs persist the current state.
- Automatic transitions execute and continue through the state graph.
- Manual transitions create pending tasks for the current state.
- Completing a task persists submitted workflow field values and resumes the exact selected transition.
- Before / During / After transition actions are executed in order.
- Action templates support workflow fields and file metadata.
- Run history and retry remain supported.

## Persistence
No new Prisma model is required. Workflow fields remain in the existing `WorkflowStep` JSON with `kind = WORKFLOW_FIELDS`; transition phases remain in `WorkflowTransition.actions` JSON.
