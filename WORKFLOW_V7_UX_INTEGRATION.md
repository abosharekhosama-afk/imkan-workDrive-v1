# Workflow V7 UX & Integration Pass

## UI/UX
- Removed the dedicated workflow secondary sidebar. Workflow navigation is now a horizontal workspace navigation inside the main content area.
- Added a reusable workflow help dialog (`workflow-help.tsx`) and contextual help button to workflow list, builder steps, tasks, and run history.
- Reworked Configure Fields into a real HTML5 drag-and-drop flow. Field type cards are draggable; the field editor opens only after a successful drop. Existing fields remain editable.
- Reworked the Design step for more breathing room: compact elements rail, larger canvas, SVG transition connectors, draggable states, branch `+` handles, zoom, and mini-map.
- Added Arabic UI support to all redesigned workflow screens using the existing locale provider and RTL document direction.
- Added lighter transitions, hover/focus feedback, backdrop blur and compact cards to reduce visual density.

## File action integration
- Added real Copy To support to the table action menu for files and folders.
- Copy opens the existing folder destination picker and calls the real `/files/:id/copy` or `/folders/:id/copy` API.
- Removed fake placeholder actions from the row action menu. Actions are rendered only when a real handler is supplied.
- Assign Workflow remains connected to the real workflow picker and `/workflows/:id/start` flow.

## Workflow logic
- Existing V6 state-machine runtime is preserved: states, transitions, manual tasks, workflow fields, Before/During/After actions, run history and activation remain wired to the backend.
- V7 is a UX/integration pass and does not replace the existing workflow engine.

## Validation note
The uploaded source did not contain installed frontend dependencies. `npm ci` could not complete within the execution environment, so a full Next.js production build was not claimed as passing. Source-level changes were inspected and the final archive contains a single clean project root.
