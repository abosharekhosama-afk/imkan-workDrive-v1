ALTER TABLE `audit_logs`
  ADD COLUMN `previous_hash` CHAR(64) NULL,
  ADD COLUMN `integrity_hash` CHAR(64) NULL;

CREATE TABLE `office_audit_policies` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `retention_days` INTEGER NOT NULL DEFAULT 365,
  `immutable_chain` BOOLEAN NOT NULL DEFAULT true,
  `export_enabled` BOOLEAN NOT NULL DEFAULT true,
  `updated_by_id` CHAR(36) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `office_audit_policies_org_id_key` (`org_id`),
  INDEX `office_audit_policies_org_id_updated_at_idx` (`org_id`,`updated_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `office_audit_policies_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `office_audit_policies_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
);
