CREATE TABLE `connection_health_alerts` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `connection_id` CHAR(36) NOT NULL,
  `severity` VARCHAR(20) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  `error_code` VARCHAR(80) NULL,
  `message` TEXT NULL,
  `failure_count` INT NOT NULL DEFAULT 1,
  `opened_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `resolved_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  INDEX `connection_health_alerts_org_id_connection_id_status_last_seen_at_idx` (`org_id`, `connection_id`, `status`, `last_seen_at`),
  INDEX `connection_health_alerts_org_id_status_last_seen_at_idx` (`org_id`, `status`, `last_seen_at`),
  CONSTRAINT `connection_health_alerts_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `connection_health_alerts_connection_id_fkey` FOREIGN KEY (`connection_id`) REFERENCES `connections` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
