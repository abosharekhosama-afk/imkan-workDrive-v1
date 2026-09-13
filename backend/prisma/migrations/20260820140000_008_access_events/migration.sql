CREATE TABLE `access_events` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `resource_type` ENUM('FILE', 'FOLDER') NOT NULL,
  `resource_id` CHAR(36) NOT NULL,
  `action` VARCHAR(191) NOT NULL,
  `accessed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `access_events_org_id_user_id_accessed_at_idx` (`org_id`, `user_id`, `accessed_at`),
  INDEX `access_events_org_id_resource_type_resource_id_accessed_at_idx` (`org_id`, `resource_type`, `resource_id`, `accessed_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `access_events_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `access_events_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
