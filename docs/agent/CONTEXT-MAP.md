CURRENT TASK: PHASE-05-US3-FRONTEND-PENDING-VERIFICATION

MUST READ:
- docs/agent/PROJECT-STATE.md
- docs/agent/CURRENT-PHASE.md
- docs/agent/CURRENT-TASK.md
- specs/001-team-folders-acl/tasks.md
- backend/src/team-folders/team-folders.service.ts
- backend/src/team-folders/team-folders.controller.ts
- backend/src/permissions/permission.service.ts
- backend/test/team-folder-acl.live.integration.e2e-spec.ts
- frontend/e2e/team-folder-acl.spec.ts
- frontend/src/lib/workspace-routes.ts
- frontend/src/i18n/i18n.spec.ts
- docs/agent/DECISIONS.md (DEC-012)

DO NOT:
- Treat T025 as PASS without a browser run
- Start T027+ before T026
- Weaken T008 non-member 404 assertions
- Use isPublicToOrg as membership
- Start Docker/MinIO
