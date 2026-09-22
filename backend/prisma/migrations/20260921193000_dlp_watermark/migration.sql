CREATE TABLE `dlp_classification_labels` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` VARCHAR(500) NULL,
  `color` VARCHAR(7) NULL,
  `actions` JSON NOT NULL,
  `manual_only` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `dlp_classification_labels_org_id_name_key` (`org_id`,`name`),
  INDEX `dlp_classification_labels_org_id_created_at_idx` (`org_id`,`created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `dlp_policies` (
  `id` CHAR(36) NOT NULL, `org_id` CHAR(36) NOT NULL, `name` VARCHAR(191) NOT NULL, `description` VARCHAR(500) NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true, `scope_type` ENUM('ALL','SELECTED_FOLDERS','EXCLUDED_FOLDERS') NOT NULL DEFAULT 'ALL',
  `folder_ids` JSON NOT NULL, `keywords` JSON NOT NULL, `extensions` JSON NOT NULL, `case_sensitive` BOOLEAN NOT NULL DEFAULT false,
  `label_id` CHAR(36) NOT NULL, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  INDEX `dlp_policies_org_id_enabled_idx` (`org_id`,`enabled`), INDEX `dlp_policies_org_id_label_id_idx` (`org_id`,`label_id`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `file_dlp_labels` (
  `id` CHAR(36) NOT NULL, `org_id` CHAR(36) NOT NULL, `file_id` CHAR(36) NOT NULL, `label_id` CHAR(36) NOT NULL, `policy_id` CHAR(36) NULL,
  `source` VARCHAR(20) NOT NULL DEFAULT 'MANUAL', `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `file_dlp_labels_file_id_label_id_key` (`file_id`,`label_id`), INDEX `file_dlp_labels_org_id_file_id_idx` (`org_id`,`file_id`), INDEX `file_dlp_labels_org_id_label_id_idx` (`org_id`,`label_id`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `dlp_classification_labels` ADD CONSTRAINT `dlp_classification_labels_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `dlp_policies` ADD CONSTRAINT `dlp_policies_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `dlp_policies` ADD CONSTRAINT `dlp_policies_label_id_fkey` FOREIGN KEY (`label_id`) REFERENCES `dlp_classification_labels`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `file_dlp_labels` ADD CONSTRAINT `file_dlp_labels_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `file_dlp_labels` ADD CONSTRAINT `file_dlp_labels_file_id_fkey` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `file_dlp_labels` ADD CONSTRAINT `file_dlp_labels_label_id_fkey` FOREIGN KEY (`label_id`) REFERENCES `dlp_classification_labels`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `file_dlp_labels` ADD CONSTRAINT `file_dlp_labels_policy_id_fkey` FOREIGN KEY (`policy_id`) REFERENCES `dlp_policies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
