-- P4: immutability + dual-control purge

ALTER TABLE `backup_runs`
  ADD COLUMN `locked` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `immutable_until` DATETIME(3) NULL,
  ADD COLUMN `purged_at` DATETIME(3) NULL;

CREATE TABLE `backup_purge_requests` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `run_id` CHAR(36) NOT NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `reason` VARCHAR(1000) NOT NULL,
  `requested_by_id` CHAR(36) NOT NULL,
  `approved_by_id` CHAR(36) NULL,
  `decision_note` VARCHAR(1000) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `decided_at` DATETIME(3) NULL,
  `executed_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  INDEX `backup_purge_requests_org_id_status_created_at_idx` (`org_id`, `status`, `created_at`),
  INDEX `backup_purge_requests_run_id_idx` (`run_id`),
  CONSTRAINT `backup_purge_requests_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `backup_purge_requests_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `backup_runs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
