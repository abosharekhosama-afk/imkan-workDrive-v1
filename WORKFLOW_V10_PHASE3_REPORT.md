# IMKAN WorkDrive — Workflow V10 Phase 3 Report

## Scope
V10 continues from V9 and preserves the V8 desktop/mobile workflow UX. This phase implements the next architectural parity layer: immutable workflow versions, richer nested conditions, group/role participant resolution, and SLA escalation.

## 1. Workflow versioning

### Implemented
- Added `WorkflowVersion` as an immutable published snapshot.
- Added `Workflow.activeVersionId`.
- Added `WorkflowRun.versionId` so every execution records the exact published definition used at start.
- Activation now publishes a new version instead of mutating the currently published definition.
- Automatic and manual starts use the active published snapshot.
- Retry continues to use the run's recorded version.
- Editing an active workflow is blocked; the workflow must be deactivated first.
- Editing is also blocked while executions are QUEUED/RUNNING/WAITING, protecting in-flight state-machine references.
- Added version history API and rollback-to-draft API.

### Endpoints
- `GET /workflows/:id/versions`
- `POST /workflows/:id/versions/:versionId/rollback`

## 2. Rich condition engine

The transition condition format now supports recursive groups:

```json
{
  "logic": "AND",
  "rules": [
    { "field": "fileType", "operator": "equals", "value": "PDF" },
    {
      "logic": "OR",
      "rules": [
        { "field": "extension", "operator": "equals", "value": "pdf" },
        { "field": "name", "operator": "contains", "value": "contract" }
      ]
    }
  ]
}
```

Supported comparisons include equals, not equals, contains, starts with, ends with, greater than, and less than. Legacy `all`/`any` conditions remain supported.

The Builder now exposes a visual recursive condition group editor with AND/OR selection and nested groups.

## 3. Group and role participants

Workflow approval/manual tasks can resolve participants from:
- individual users
- organization groups
- organization roles (`MEMBER`, `ADMIN`, `SUPER_ADMIN`)

A new participant-options endpoint exposes active users, groups, and supported roles without requiring administrator-only group APIs.

Runtime participant resolution always re-checks active organization membership before creating task participants.

## 4. SLA and escalation

Workflow tasks now persist:
- escalation configuration
- escalation level
- last escalation timestamp

The workflow worker evaluates pending tasks and sends escalation notifications after the configured SLA interval. Escalation recipients can be users, groups, or organization roles. Overdue tasks are promoted to HIGH priority and remain actionable.

## 5. Database changes

New migrations:
- `20260914193000_workflow_versions`
- `20260914194000_workflow_sla_escalation`

The existing V9 participant/deadline migration remains part of the chain.

## 6. Frontend changes

- Existing V8 responsive layout is preserved.
- Builder shows the current published version badge/history.
- Approval action supports users, groups, and organization roles.
- Condition inspector supports recursive AND/OR groups.
- SLA escalation configuration is available alongside due date/reminder configuration.

## 7. Remaining gaps before full Zoho-class parity

Still required for a stronger production target:
1. Separate visual SLA designer with multiple escalation levels and reassignment, not notification-only escalation.
2. Business calendars/time zones/working-hours-aware deadlines.
3. Full field-type validation and field value forms per transition.
4. Data Template action.
5. Custom Function execution sandbox.
6. Default Review / Approval / Review & Approval templates.
7. Full configuration audit diff and restore UI.
8. External durable queue/worker infrastructure with locking/lease recovery.
9. Rich participant expressions such as manager-of-owner, folder owner, resource owner, and dynamic role mapping.
10. Comprehensive integration/e2e tests against a real MySQL database.

## Validation

- TypeScript parser/source checks were run against changed workflow files.
- The environment does not contain installed project dependencies, so a complete Next.js/NestJS typecheck/build and Prisma client generation were not claimed.
- Prisma migrations were reviewed structurally; a live MySQL migration was not executed in the sandbox.

## Engineering verdict

V10 materially upgrades the workflow definition model. The most important change is that active executions now have a version identity instead of depending solely on mutable workflow configuration. Conditions and participant resolution are also significantly closer to enterprise workflow semantics.
