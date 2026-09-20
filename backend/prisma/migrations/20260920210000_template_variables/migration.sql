CREATE TABLE `template_variables` (
  `id` CHAR(36) NOT NULL,
  `template_id` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `label` VARCHAR(191) NOT NULL,
  `type` ENUM('TEXT','NUMBER','DATE','BOOLEAN','EMAIL','URL','CURRENCY','IMAGE','USER','FILE','CHOICE') NOT NULL,
  `default_value` TEXT NULL,
  `required` BOOLEAN NOT NULL DEFAULT false,
  `description` TEXT NULL,
  `options` JSON NULL,
  `format` VARCHAR(191) NULL,
  `position` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `template_variables_template_id_name_key` (`template_id`,`name`),
  INDEX `template_variables_template_id_position_idx` (`template_id`,`position`),
  CONSTRAINT `template_variables_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `templates` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
