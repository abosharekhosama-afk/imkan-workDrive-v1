ALTER TABLE `file_metadata`
  ADD COLUMN `custom_fields` JSON NULL,
  ADD COLUMN `content_text` LONGTEXT NULL,
  ADD COLUMN `ocr_text` LONGTEXT NULL,
  ADD COLUMN `data_template_id` CHAR(36) NULL,
  ADD INDEX `file_metadata_data_template_id_idx` (`data_template_id`);

CREATE TABLE `file_data_templates` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `schema` JSON NOT NULL,
  `required_fields` JSON NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `created_by_id` CHAR(36) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `file_data_templates_org_id_name_key` (`org_id`,`name`),
  KEY `file_data_templates_org_id_active_idx` (`org_id`,`active`),
  CONSTRAINT `file_data_templates_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `folders`
  ADD COLUMN `data_template_id` CHAR(36) NULL,
  ADD INDEX `folders_data_template_id_idx` (`data_template_id`),
  ADD CONSTRAINT `folders_data_template_id_fkey` FOREIGN KEY (`data_template_id`) REFERENCES `file_data_templates` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `file_metadata`
  ADD CONSTRAINT `file_metadata_data_template_id_fkey` FOREIGN KEY (`data_template_id`) REFERENCES `file_data_templates` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
