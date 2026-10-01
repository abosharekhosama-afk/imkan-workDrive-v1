CREATE TABLE `workspace_labels` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `name` VARCHAR(80) NOT NULL,
  `color` VARCHAR(20) NOT NULL DEFAULT '#3B82F6',
  `position` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`), UNIQUE INDEX `workspace_labels_user_id_name_key` (`user_id`,`name`),
  INDEX `workspace_labels_org_id_user_id_position_idx` (`org_id`,`user_id`,`position`),
  CONSTRAINT `workspace_labels_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `workspace_labels_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `workspace_label_resources` (
  `id` CHAR(36) NOT NULL, `org_id` CHAR(36) NOT NULL, `user_id` CHAR(36) NOT NULL, `label_id` CHAR(36) NOT NULL,
  `resource_type` ENUM('FILE','FOLDER') NOT NULL, `resource_id` CHAR(36) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`),
  UNIQUE INDEX `workspace_label_resources_label_id_resource_type_resource_id_key` (`label_id`,`resource_type`,`resource_id`),
  INDEX `workspace_label_resources_org_id_user_id_resource_type_resource_id_idx` (`org_id`,`user_id`,`resource_type`,`resource_id`),
  CONSTRAINT `workspace_label_resources_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `workspace_label_resources_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `workspace_label_resources_label_id_fkey` FOREIGN KEY (`label_id`) REFERENCES `workspace_labels`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
