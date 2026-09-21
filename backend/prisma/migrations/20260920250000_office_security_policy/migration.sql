CREATE TABLE `office_security_policies` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `force_read_only` BOOLEAN NOT NULL DEFAULT false,
  `disable_export` BOOLEAN NOT NULL DEFAULT false,
  `disable_copy` BOOLEAN NOT NULL DEFAULT false,
  `disable_offline` BOOLEAN NOT NULL DEFAULT false,
  `require_watermark` BOOLEAN NOT NULL DEFAULT false,
  `watermark_text` VARCHAR(500) NULL,
  `updated_by_id` CHAR(36) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `office_security_policies_org_id_key` (`org_id`),
  INDEX `office_security_policies_updated_by_id_idx` (`updated_by_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `office_security_policies_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `office_security_policies_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
