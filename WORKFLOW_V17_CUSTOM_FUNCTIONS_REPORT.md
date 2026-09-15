# Workflow V17 — Custom Functions

## Scope
V17-A implements a controlled Custom Function runtime. It intentionally does **not** execute arbitrary JavaScript inside the NestJS process.

## Implemented
- Immutable `WorkflowFunctionVersion` records.
- Active version pinning through `WorkflowFunction.activeVersionId`.
- `WorkflowFunctionExecution` audit/runtime records.
- Safe operation allow-list: `SET_FIELD`, `COPY_VALUE`, `CONCAT`, `LOWERCASE`, `UPPERCASE`, `NUMBER`, `ADD`, `SUBTRACT`, `MULTIPLY`, `DIVIDE`, `NOTIFY_OWNER`, `ADD_TAG`, `IF`.
- Dynamic value interpolation through the V15 runtime.
- Input/output contract and bounded operation count.
- Execution idempotency key for workflow-triggered function execution.
- Function test endpoint using the same executor contract.
- Function versions list/publish endpoints.
- Builder support for selecting an active custom function/version.
- New Safe Functions management UI.
- Audit events for creation and publishing.
- Migration backfill for existing registered built-in functions as SAFE v1 snapshots.

## Security posture
The V17-A executor does not expose filesystem, process, shell, environment variables, arbitrary imports, eval, or network access to function definitions. Runtime is `SAFE` only.

## Verification
- TypeScript/TSX parse validation: 0 parse diagnostics across backend/frontend source.
- Added unit coverage for allow-list and definition limits.
- Prisma CLI validation could not be completed in the build environment because dependency installation/network resolution timed out. No claim of live database migration success is made.

## Not yet V17-B
A true arbitrary-code sandbox with process/container isolation, CPU/memory enforcement, network namespace controls and OS-level confinement is intentionally deferred. It must be implemented as a separate isolated worker/container rather than `eval` or `new Function` in the API/worker process.

## Production readiness
V17-A source completeness: high for the controlled runtime path.
Production certification: **not certified** until dependencies, migrations, database, worker concurrency and E2E/security tests are executed in a real environment.
