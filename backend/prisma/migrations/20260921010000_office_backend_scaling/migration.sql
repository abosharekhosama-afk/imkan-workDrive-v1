-- Phase 60: Backend Scaling
-- Hot-path audit lookup for Office document history.
CREATE INDEX `audit_logs_org_id_resource_type_resource_id_created_at_idx`
  ON `audit_logs` (`org_id`, `resource_type`, `resource_id`, `created_at`);
