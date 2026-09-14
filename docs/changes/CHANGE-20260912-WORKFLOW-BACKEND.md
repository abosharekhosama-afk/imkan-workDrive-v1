# Phase 2 — Workflow persistence and real details API

## Implemented
- Added organization-scoped `Workflow` and `WorkflowStep` Prisma models.
- Added PostgreSQL migration `20260912190000_add_workflows` with foreign keys, indexes, unique step positions and cascade cleanup.
- Added authenticated `/workflows` CRUD endpoints plus activate/deactivate actions.
- Workflow writes are scoped to `user.org_id`; only the owner can modify/delete/activate/deactivate.
- Replaced browser `localStorage` workflow persistence with API/Prisma persistence.
- Added a real `GET /files/:id/details` endpoint with owner, location, metadata, visibility and tags.
- File details UI now prefers the server detail payload and falls back to the loaded row if the endpoint fails.
- Added EN/AR labels for workflow actions.

## Deliberate boundaries
- Workflow execution engine is not claimed as complete. Active workflows are stored and validated, but triggers are not yet dispatched automatically from upload/folder events.
- Document/Sheet/Slide editors remain outside this phase because the repository does not contain their real editor/storage contract.
- Zia remains a coming-soon feature as requested.

## Verification
- EN/AR message JSON parsing: PASS.
- Dependency installation could not complete in the isolated execution environment (npm CI transport timeout), so TypeScript/Prisma generation and full test suites were not executed here.
