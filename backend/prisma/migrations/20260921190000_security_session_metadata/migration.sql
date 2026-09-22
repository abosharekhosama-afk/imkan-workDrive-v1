ALTER TABLE `sessions`
  ADD COLUMN `ip_address` VARCHAR(255) NULL,
  ADD COLUMN `user_agent` TEXT NULL,
  ADD COLUMN `device_id` CHAR(36) NULL;

CREATE INDEX `sessions_org_id_revoked_at_expires_at_idx`
  ON `sessions` (`org_id`, `revoked_at`, `expires_at`);

CREATE INDEX `security_events_org_id_event_type_created_at_idx`
  ON `security_events` (`org_id`, `event_type`, `created_at`);
