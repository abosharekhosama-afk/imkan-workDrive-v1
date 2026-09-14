CREATE TABLE `workflow_runs` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `workflow_id` CHAR(36) NOT NULL,
  `event_key` CHAR(64) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'SUCCEEDED',
  `trigger` JSON NOT NULL,
  `result` JSON NULL,
  `error` TEXT NULL,
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finished_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `workflow_runs_workflow_id_event_key_key` (`workflow_id`,`event_key`),
  KEY `workflow_runs_org_id_started_at_idx` (`org_id`,`started_at`),
  KEY `workflow_runs_workflow_id_started_at_idx` (`workflow_id`,`started_at`),
  CONSTRAINT `workflow_runs_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `workflow_runs_workflow_id_fkey` FOREIGN KEY (`workflow_id`) REFERENCES `workflows` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
