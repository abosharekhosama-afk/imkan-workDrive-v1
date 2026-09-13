CREATE TABLE `favorites` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `resource_type` ENUM('FILE', 'FOLDER') NOT NULL,
  `resource_id` CHAR(36) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `favorites_user_id_resource_type_resource_id_key` (`user_id`, `resource_type`, `resource_id`),
  INDEX `favorites_org_id_user_id_idx` (`org_id`, `user_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `favorites_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `favorites_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
