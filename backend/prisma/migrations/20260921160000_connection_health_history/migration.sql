CREATE TABLE `connection_health_checks` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `connection_id` CHAR(36) NOT NULL,
  `status` VARCHAR(40) NOT NULL,
  `error_code` VARCHAR(80) NULL,
  `message` TEXT NULL,
  `latency_ms` INT NULL,
  `source` VARCHAR(40) NOT NULL DEFAULT 'MANUAL',
  `checked_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `connection_health_checks_org_id_connection_id_checked_at_idx` (`org_id`, `connection_id`, `checked_at`),
  INDEX `connection_health_checks_org_id_status_checked_at_idx` (`org_id`, `status`, `checked_at`),
  CONSTRAINT `connection_health_checks_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `connection_health_checks_connection_id_fkey` FOREIGN KEY (`connection_id`) REFERENCES `connections` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
