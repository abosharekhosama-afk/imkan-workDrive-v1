ALTER TABLE `workflows` ADD COLUMN `calendar_config` JSON NULL;
ALTER TABLE `workflows` ADD COLUMN `is_system_default` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `workflow_data_templates` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `template` TEXT NOT NULL,
  `format` VARCHAR(191) NOT NULL DEFAULT 'TEXT',
  `created_by_id` CHAR(36) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `workflow_data_templates_org_id_name_idx` (`org_id`, `name`),
  CONSTRAINT `workflow_data_templates_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `workflow_data_templates_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `workflow_functions` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `kind` VARCHAR(191) NOT NULL DEFAULT 'BUILT_IN',
  `config` JSON NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `created_by_id` CHAR(36) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `workflow_functions_org_id_key_key` (`org_id`, `key`),
  INDEX `workflow_functions_org_id_enabled_idx` (`org_id`, `enabled`),
  CONSTRAINT `workflow_functions_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `workflow_functions_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
