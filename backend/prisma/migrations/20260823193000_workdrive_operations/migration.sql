ALTER TABLE `folders` ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
ALTER TABLE `files` ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

CREATE TABLE `share_recipients` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `share_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `permission` VARCHAR(191) NOT NULL DEFAULT 'VIEW',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `share_recipients_share_id_user_id_key` (`share_id`,`user_id`),
  INDEX `share_recipients_org_id_user_id_idx` (`org_id`,`user_id`),
  CONSTRAINT `share_recipients_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `share_recipients_share_id_fkey` FOREIGN KEY (`share_id`) REFERENCES `shares` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `share_recipients_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
