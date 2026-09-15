# Workflow V18 — Production Completion & Zoho Competition Master Report

## Phase scores
| Phase | Scope | Estimated competition |
|---|---|---:|
| V18.1 | Builder completion | 88% |
| V18.2 | Dynamic Values picker | 92% |
| V18.3 | Queue Operations | 95% |
| V18.4 | Audit + Version Diff | 94% |
| V18.5 | UX certification | 90% |
| V18.6 | Integration certification | 93% |

## Overall
**93% estimated competition for the Workflow module against Zoho WorkDrive.**

This is an engineering estimate based on documented workflow capabilities and the current source implementation, not a vendor-certified benchmark.

## Zoho baseline
Official WorkDrive documentation currently describes manual and automatic workflows, file/folder workflows, triggers, states, transitions, actions, workflow fields, default Review/Approval/Review & Approval workflows, and custom functions. It documents up to 20 states and up to 5 actions per state/transition. citeturn0search0turn0search1turn0search2

## Where Imkan is strong
- Version-pinned workflow runtime.
- DB-backed queue with leases, heartbeat and stale recovery.
- Operational queue center with retry/requeue/recover/dead-letter.
- Central audit center and workflow snapshot diff.
- Data Template versioning and preview.
- Safe Function versioning/testing and bounded operations.
- Dynamic value catalog and searchable insertion picker.
- Mobile builder/inspector and unified visual language.

## Remaining strategic gaps
- Full isolated arbitrary-code custom-function sandbox.
- More mature visual polish and interaction details compared with Zoho's production UI.
- Enterprise external-user workflow participation and cross-boundary orchestration.
- Full browser E2E certification requires dependencies and a running environment.

## Validation statement
Source-level validation was performed. Full build/typecheck/browser E2E is **not certified** in this snapshot because dependencies are not installed in the provided environment.
