CREATE TABLE `connection_secret_versions` (
  `id` CHAR(36) NOT NULL, `connection_id` CHAR(36) NOT NULL, `version` INTEGER NOT NULL,
  `access_token` TEXT NULL, `refresh_token` TEXT NULL, `api_key` TEXT NULL, `bearer_token` TEXT NULL,
  `username` TEXT NULL, `password` TEXT NULL, `custom_headers` TEXT NULL, `created_by_id` CHAR(36) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `secret_id` CHAR(36) NULL,
  PRIMARY KEY (`id`), UNIQUE KEY `connection_secret_versions_connection_id_version_key` (`connection_id`,`version`),
  KEY `connection_secret_versions_connection_id_created_at_idx` (`connection_id`,`created_at`),
  CONSTRAINT `connection_secret_versions_connection_id_fkey` FOREIGN KEY (`connection_id`) REFERENCES `connections` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `connection_secret_versions_secret_id_fkey` FOREIGN KEY (`secret_id`) REFERENCES `connection_secrets` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `connection_secret_versions` (`id`,`connection_id`,`version`,`access_token`,`refresh_token`,`api_key`,`bearer_token`,`username`,`password`,`custom_headers`,`created_by_id`,`created_at`,`secret_id`)
SELECT UUID(), `connection_id`, 1, `access_token`,`refresh_token`,`api_key`,`bearer_token`,`username`,`password`,`custom_headers`,`owner_id`,`created_at`,`id` FROM `connection_secrets`;
