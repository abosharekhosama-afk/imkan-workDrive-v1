# Workflow UX V3 – Implementation

This package is based on the original Imkan WorkDrive project. The workflow implementation replaces the original workflow UI in these files:

- `frontend/src/app/files/workflows/page.tsx`
- `frontend/src/app/files/workflows/builder/page.tsx`
- `frontend/src/app/files/workflows/tasks/page.tsx`
- `frontend/src/app/globals.css`
- `backend/src/workflows/workflows.service.ts`

## V3 changes

1. Three-pane workflow builder: Elements / Visual Canvas / Configuration.
2. Visual canvas with draggable State nodes.
3. SVG curved connectors with arrowheads between states.
4. Multiple transitions/branches from a state.
5. Transition selection directly from its connector label.
6. Canvas zoom, reset and fit controls.
7. Mini-map showing the workflow layout.
8. State configuration in the right inspector.
9. Transition configuration with Before / During / After tabs.
10. Per-transition actions, with action configuration controls.
11. Workflow fields tab with field type/required configuration.
12. Review tab with validation before enabling.
13. Workflow list redesigned as a compact management table.
14. Waiting-for-action/tasks page redesigned as a compact table.
15. Workflow fields are persisted in the existing WorkflowStep JSON config as `WORKFLOW_FIELDS`; no Prisma migration is required.

## Important

This is a source-code implementation. Full build/typecheck should be run after installing dependencies in the normal project environment.
