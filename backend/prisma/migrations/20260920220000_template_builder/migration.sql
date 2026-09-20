CREATE TABLE `template_builders` (
  `id` CHAR(36) NOT NULL,
  `template_id` CHAR(36) NOT NULL,
  `draft` JSON NOT NULL,
  `published` JSON NULL,
  `published_at` DATETIME(3) NULL,
  `published_by_id` CHAR(36) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `template_builders_template_id_key` (`template_id`),
  INDEX `template_builders_published_by_id_idx` (`published_by_id`),
  CONSTRAINT `template_builders_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `templates` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `template_builders_published_by_id_fkey` FOREIGN KEY (`published_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
