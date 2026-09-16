ALTER TABLE `workflows` ADD COLUMN `active_version_id` CHAR(36) NULL;

CREATE TABLE `workflow_versions` (
  `id` CHAR(36) NOT NULL,
  `workflow_id` CHAR(36) NOT NULL,
  `version` INT NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PUBLISHED',
  `snapshot` JSON NOT NULL,
  `created_by_id` CHAR(36) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `published_at` DATETIME(3) NULL,
  UNIQUE INDEX `workflow_versions_workflow_id_version_key`(`workflow_id`, `version`),
  INDEX `workflow_versions_workflow_id_status_idx`(`workflow_id`, `status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `workflow_versions_workflow_id_fkey` FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `workflows` ADD CONSTRAINT `workflows_active_version_id_fkey` FOREIGN KEY (`active_version_id`) REFERENCES `workflow_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `workflow_runs` ADD COLUMN `version_id` CHAR(36) NULL;
CREATE INDEX `workflow_runs_version_id_idx` ON `workflow_runs`(`version_id`);
ALTER TABLE `workflow_runs` ADD CONSTRAINT `workflow_runs_version_id_fkey` FOREIGN KEY (`version_id`) REFERENCES `workflow_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
