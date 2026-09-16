ALTER TABLE `workflow_data_templates`
  ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN `active_version_id` CHAR(36) NULL;

CREATE TABLE `workflow_data_template_versions` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `template_id` CHAR(36) NOT NULL,
  `version` INTEGER NOT NULL,
  `template` TEXT NOT NULL,
  `format` VARCHAR(191) NOT NULL,
  `variables` JSON NULL,
  `created_by_id` CHAR(36) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `workflow_data_template_versions_template_id_version_key` (`template_id`,`version`),
  KEY `workflow_data_template_versions_org_id_template_id_version_idx` (`org_id`,`template_id`,`version`),
  CONSTRAINT `workflow_data_template_versions_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `workflow_data_template_versions_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `workflow_data_templates` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `workflow_data_template_versions_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `workflow_data_templates_active_version_id_key` ON `workflow_data_templates` (`active_version_id`);
ALTER TABLE `workflow_data_templates`
  ADD CONSTRAINT `workflow_data_templates_active_version_id_fkey` FOREIGN KEY (`active_version_id`) REFERENCES `workflow_data_template_versions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill one immutable v1 for every existing template, then point active_version_id at it.
INSERT INTO `workflow_data_template_versions` (`id`,`org_id`,`template_id`,`version`,`template`,`format`,`created_by_id`)
SELECT UUID(), `org_id`, `id`, 1, `template`, `format`, `created_by_id`
FROM `workflow_data_templates`;

UPDATE `workflow_data_templates` t
JOIN `workflow_data_template_versions` v ON v.template_id = t.id AND v.version = 1
SET t.active_version_id = v.id;
