CREATE TABLE `template_libraries` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NULL,
  `owner_id` CHAR(36) NULL,
  `type` ENUM('PERSONAL','ORGANIZATION','PUBLIC') NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `template_libraries_org_id_owner_id_type_key` (`org_id`,`owner_id`,`type`),
  INDEX `template_libraries_org_id_type_idx` (`org_id`,`type`),
  CONSTRAINT `template_libraries_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `template_libraries_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `template_categories` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NULL,
  `library_id` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `position` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `template_categories_library_id_name_key` (`library_id`,`name`),
  INDEX `template_categories_org_id_library_id_idx` (`org_id`,`library_id`),
  CONSTRAINT `template_categories_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `template_categories_library_id_fkey` FOREIGN KEY (`library_id`) REFERENCES `template_libraries` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `templates` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NULL,
  `library_id` CHAR(36) NOT NULL,
  `category_id` CHAR(36) NULL,
  `owner_id` CHAR(36) NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `type` ENUM('DOCUMENT','SPREADSHEET','PRESENTATION') NOT NULL,
  `status` ENUM('ACTIVE','DISABLED','TRASHED') NOT NULL DEFAULT 'ACTIVE',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  INDEX `templates_org_id_library_id_status_idx` (`org_id`,`library_id`,`status`),
  INDEX `templates_org_id_owner_id_idx` (`org_id`,`owner_id`),
  INDEX `templates_library_id_category_id_idx` (`library_id`,`category_id`),
  FULLTEXT INDEX `templates_name_description_fulltext` (`name`,`description`),
  CONSTRAINT `templates_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `templates_library_id_fkey` FOREIGN KEY (`library_id`) REFERENCES `template_libraries` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `templates_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `template_categories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `templates_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `template_versions` (
  `id` CHAR(36) NOT NULL,
  `template_id` CHAR(36) NOT NULL,
  `version_number` INTEGER NOT NULL,
  `storage_key` VARCHAR(512) NOT NULL,
  `size` BIGINT NOT NULL,
  `mime_type` VARCHAR(191) NOT NULL,
  `extension` VARCHAR(32) NULL,
  `sha256_hash` CHAR(64) NOT NULL,
  `created_by_id` CHAR(36) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `template_versions_template_id_version_number_key` (`template_id`,`version_number`),
  INDEX `template_versions_template_id_created_at_idx` (`template_id`,`created_at`),
  CONSTRAINT `template_versions_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `templates` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `template_versions_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
