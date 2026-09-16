# IMKAN WorkDrive — Phase D Manual Workflow Start UX

## Implemented

- Reworked `WorkflowPicker` from an immediate-start list into a two-step manual-start flow:
  1. Select an active manual workflow matching FILE/FOLDER resource type.
  2. Review workflow details and start configuration before execution.
- Loads the published workflow definition before starting.
- Renders configured Workflow Fields at start time, including required/default/max-length/email/number/boolean/choice handling.
- Loads organization participant options and supports starter-selected users, groups, and organization roles when the workflow explicitly allows starter participant selection.
- Adds optional start comment.
- Sends `fieldValues`, `participantRules`, and `comment` to the existing `/workflows/:id/start` endpoint.
- Added a Builder control on `request_approval`: “Let the workflow starter choose participants”.
- Added server-side validation for workflow fields, defaults, data types, required values, choice values, and participant selections.
- Server rejects participant selection unless the published workflow explicitly enables starter participant selection.
- Server resolves selected participant rules again against active organization membership before queueing the run.
- Starter input is persisted inside the WorkflowRun `result.startInput` together with initial `fieldValues`.
- Runtime approval action uses starter-selected participants only when the published action explicitly enables that behavior; otherwise it preserves configured workflow participants.

## Security / compatibility

- The existing manual-start resource write-permission check remains in place.
- Organization scoping remains server-side.
- The authenticated user remains authoritative as the workflow starter; client-supplied `userId` is ignored/overwritten by the controller.
- Existing file/team-folder ACLs, sharing, authentication, and unrelated file behavior were not modified.
- No database migration was required because WorkflowRun already stores JSON `result`.

## Changed files

- `backend/src/workflows/workflow-engine.service.ts`
- `backend/src/workflows/workflow-manual-start.spec.ts`
- `frontend/src/components/workflow-picker.tsx`
- `frontend/src/app/files/workflows/builder/page.tsx`
- `frontend/src/components/workflow-picker.spec.tsx`

## Validation

- Source-level review completed.
- Dependency-backed Jest/TypeScript/build/browser E2E was not executed because the supplied project snapshot does not have installed `node_modules`.
- This phase should therefore be treated as source-complete, not production-certified.
