# Workflow V5 — Zoho-like behavior implementation

This version is rebuilt from the original Imkan WorkDrive project and implements the workflow behavior shown in the supplied Zoho WorkDrive reference screenshots.

## Implemented flow

1. **Create Workflow** modal
   - Manual / Automatic
   - Name
   - Description
   - File-based / Folder-based
2. **Configure fields**
   - Single line text
   - Multi line text
   - Number
   - Date & time
   - Date
   - Yes/No
   - Choice
   - Email
   - Field editor with description, default value, required flag, max characters/value and choice options.
3. **Design workflow**
   - Start trigger
   - States
   - Transitions
   - Drag state nodes
   - Visual SVG connectors and arrow heads
   - Branching transitions
   - Zoom/reset
   - Mini map
   - State inspector
   - Transition inspector: Before / During / After
   - Automatic vs Manual transitions
   - Conditions
   - Instant actions
4. **Review / activation**
   - Validation before activation
   - Activation confirmation modal
   - Draft save and active save
5. **Runtime behavior**
   - Automatic workflow events create runs
   - Starting conditions are evaluated
   - Workflow state is persisted on each run
   - Automatic transitions continue while conditions match
   - Manual transitions create pending tasks
   - Task actions are limited to transitions that were available for the current state
   - Completing a task stores workflow field values and continues the run
   - Before / During / After actions are executed by phase
   - Action strings support `{{fieldId}}`, `{{file.name}}`, `{{file.id}}`, and `{{file.extension}}`
   - Run logs and retry remain available

## Important architecture note

Workflow fields are persisted inside the existing `WorkflowStep.config` JSON so no database migration is required. Runtime values are persisted in `WorkflowRun.result.fieldValues`.

The canvas layout remains a UI concern and is stored in browser localStorage per workflow.
