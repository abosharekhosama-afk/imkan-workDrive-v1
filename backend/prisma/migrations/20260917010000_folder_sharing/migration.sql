CREATE TABLE `folder_shares` (
  `id` CHAR(36) NOT NULL, `org_id` CHAR(36) NOT NULL, `folder_id` CHAR(36) NOT NULL,
  `created_by_id` CHAR(36) NOT NULL, `permission` ENUM('VIEW','COMMENT','EDIT','ORGANIZE','FULL_ACCESS') NOT NULL DEFAULT 'VIEW',
  `status` ENUM('ACTIVE','EXPIRED','REVOKED') NOT NULL DEFAULT 'ACTIVE', `link_token` VARCHAR(191) NOT NULL,
  `password_hash` VARCHAR(255) NULL, `expires_at` DATETIME(3) NULL, `can_download` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `revoked_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`), UNIQUE KEY `folder_shares_link_token_key` (`link_token`),
  KEY `folder_shares_org_id_folder_id_idx` (`org_id`,`folder_id`), KEY `folder_shares_org_id_status_idx` (`org_id`,`status`),
  KEY `folder_shares_org_id_created_by_id_idx` (`org_id`,`created_by_id`),
  CONSTRAINT `folder_shares_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `folder_shares_folder_id_fkey` FOREIGN KEY (`folder_id`) REFERENCES `folders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `folder_shares_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users` (`id`) ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `folder_share_recipients` (
  `id` CHAR(36) NOT NULL, `org_id` CHAR(36) NOT NULL, `share_id` CHAR(36) NOT NULL, `user_id` CHAR(36) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`),
  UNIQUE KEY `folder_share_recipients_share_id_user_id_key` (`share_id`,`user_id`),
  KEY `folder_share_recipients_org_id_user_id_idx` (`org_id`,`user_id`),
  CONSTRAINT `folder_share_recipients_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `folder_share_recipients_share_id_fkey` FOREIGN KEY (`share_id`) REFERENCES `folder_shares` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `folder_share_recipients_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
