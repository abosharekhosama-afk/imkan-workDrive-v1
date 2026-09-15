# Workflow V16 — Real Data Templates

## Scope
V16 upgrades Workflow Data Templates from a single mutable record into a versioned runtime resource integrated with V15 Dynamic Values.

## Implemented
- Immutable `WorkflowDataTemplateVersion` records.
- Active version pinning on each template.
- Backfill migration that creates v1 for existing templates.
- Create/update/rollback/delete/template-detail APIs.
- Template status: ACTIVE, DRAFT, ARCHIVED.
- Template format validation: TEXT, HTML, JSON.
- JSON syntax validation at write time and rendered JSON validation at runtime.
- Automatic variable extraction from `{{...}}` expressions.
- Preview API using safe runtime dynamic-value resolution without mutating a workflow run.
- Audit events for create/update/version/rollback/delete operations.
- Builder action now stores `templateVersionId` when a saved template is selected.
- Runtime loads the pinned template version and rejects archived templates.
- Runtime returns template id/version/format metadata with the action result.
- Template management UI now supports create, edit-as-new-version, preview, version history, rollback, delete protection, and status.

## Runtime flow
Workflow Action -> Template ID -> Pinned Version -> Dynamic Values -> Render -> Optional JSON validation -> Optional workflow-field output.

## Security / tenancy
Every template and version lookup is scoped to the authenticated organization. Version rollback and mutations require authenticated organization ownership context through the existing tenant-scoped service.

## Verification
- Source inspection completed.
- No dependency installation was available in the build environment (`backend/node_modules` is absent), so Prisma generation, Nest build, Jest, migration execution, and browser E2E are NOT claimed as passed.
- The migration is included and must be applied with the project's normal Prisma migration process before using the new version tables.

## Remaining V16 limitations
- HTML/PDF/DOCX are stored/rendered as content; a full document renderer/exporter is intentionally deferred to the later document-template phase.
- Preview uses representative runtime event data rather than mutating a real run.
- Template permissions currently follow organization tenancy; fine-grained template ACLs are deferred.
