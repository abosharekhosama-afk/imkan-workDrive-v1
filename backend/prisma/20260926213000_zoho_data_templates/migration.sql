ALTER TABLE `team_folders`
  ADD COLUMN `mandate_data_template_id` CHAR(36) NULL,
  ADD COLUMN `mandate_data_template_target` VARCHAR(10) NOT NULL DEFAULT 'BOTH',
  ADD INDEX `team_folders_mandate_data_template_id_idx` (`mandate_data_template_id`),
  ADD CONSTRAINT `team_folders_mandate_data_template_id_fkey` FOREIGN KEY (`mandate_data_template_id`) REFERENCES `file_data_templates` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `file_data_templates`
  ADD COLUMN `association_scope` VARCHAR(30) NOT NULL DEFAULT 'ALL_EDIT',
  ADD COLUMN `allowed_member_ids` JSON NULL,
  ADD COLUMN `allowed_group_ids` JSON NULL,
  ADD COLUMN `searchable_field_keys` JSON NULL;

CREATE TABLE `file_data_template_bindings` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `template_id` CHAR(36) NOT NULL,
  `file_id` CHAR(36) NULL,
  `folder_id` CHAR(36) NULL,
  `custom_fields` JSON NULL,
  `created_by_id` CHAR(36) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `file_data_template_bindings_template_id_file_id_key` (`template_id`,`file_id`),
  UNIQUE KEY `file_data_template_bindings_template_id_folder_id_key` (`template_id`,`folder_id`),
  KEY `file_data_template_bindings_org_id_file_id_idx` (`org_id`,`file_id`),
  KEY `file_data_template_bindings_org_id_folder_id_idx` (`org_id`,`folder_id`),
  KEY `file_data_template_bindings_org_id_template_id_idx` (`org_id`,`template_id`),
  CONSTRAINT `file_data_template_bindings_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `file_data_template_bindings_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `file_data_templates` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `file_data_template_bindings_file_id_fkey` FOREIGN KEY (`file_id`) REFERENCES `files` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `file_data_template_bindings_folder_id_fkey` FOREIGN KEY (`folder_id`) REFERENCES `folders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `file_data_template_bindings_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
