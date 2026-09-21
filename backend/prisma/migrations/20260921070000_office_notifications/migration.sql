CREATE TABLE `office_notification_preferences` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `collaboration` BOOLEAN NOT NULL DEFAULT true,
  `template_automation` BOOLEAN NOT NULL DEFAULT true,
  `exports` BOOLEAN NOT NULL DEFAULT true,
  `compliance` BOOLEAN NOT NULL DEFAULT true,
  `external_storage` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `office_notification_preferences_org_id_user_id_key` (`org_id`,`user_id`),
  INDEX `office_notification_preferences_org_id_updated_at_idx` (`org_id`,`updated_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `office_notification_preferences_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `office_notification_preferences_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
