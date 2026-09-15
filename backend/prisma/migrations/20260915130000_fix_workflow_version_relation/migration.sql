-- Fix Workflow.activeVersion -> WorkflowVersion.activeFor as a true one-to-one relation.
-- A workflow can point to one active version, and each version belongs to exactly one workflow.
CREATE UNIQUE INDEX `workflows_active_version_id_key` ON `workflows` (`active_version_id`);
