# V18.1 — Builder Completion & Zoho Parity Report

## Implemented
- Preserved and hardened the desktop 3-pane builder: Elements / Canvas / Inspector.
- Preserved mobile bottom inspector behavior and touch-oriented canvas interactions.
- State and Transition inspectors remain explicit and context-sensitive.
- Contextual help is keyed to state vs transition and builder areas.
- Visual rule remains: Workflow primary actions use the same blue New-button language; cards/panels use the New-modal/card language.

## Zoho benchmark
Zoho WorkDrive's official workflow documentation describes a builder around triggers, states, transitions, actions, conditions and workflow fields. Custom workflows require at least one state and a starting trigger; WorkDrive documents up to 20 states and up to 5 actions per state/transition. citeturn0search0turn0search2

## Estimated competition
**88% workflow-builder parity**.

Strengths: core state machine, triggers, transitions, conditions, fields, participants, actions, mobile UX, version-aware editing.
Remaining gap: Zoho's builder interaction is more polished/productized visually, and our inspector still exposes some advanced configuration in dense forms rather than a fully guided property system.
