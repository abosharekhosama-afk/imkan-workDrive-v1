CREATE TABLE `cloud_connections` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `provider` VARCHAR(32) NOT NULL,
  `access_token` TEXT NOT NULL,
  `refresh_token` TEXT NULL,
  `expires_at` DATETIME(3) NULL,
  `scope` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cloud_connections_org_id_user_id_provider_key` (`org_id`,`user_id`,`provider`),
  KEY `cloud_connections_org_id_user_id_idx` (`org_id`,`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `cloud_oauth_states` (
  `id` CHAR(36) NOT NULL,
  `state_hash` CHAR(64) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `provider` VARCHAR(32) NOT NULL,
  `folder_id` CHAR(36) NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `used_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `cloud_oauth_states_state_hash_key` (`state_hash`),
  KEY `cloud_oauth_states_org_id_user_id_expires_at_idx` (`org_id`,`user_id`,`expires_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `cloud_import_jobs` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `connection_id` CHAR(36) NOT NULL,
  `provider` VARCHAR(32) NOT NULL,
  `folder_id` CHAR(36) NULL,
  `remote_file_id` VARCHAR(2048) NOT NULL,
  `remote_name` VARCHAR(255) NOT NULL,
  `remote_mime_type` VARCHAR(255) NOT NULL,
  `status` ENUM('PENDING','IN_PROGRESS','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING',
  `progress` INT NOT NULL DEFAULT 0,
  `bytes_done` BIGINT NOT NULL DEFAULT 0,
  `total_bytes` BIGINT NULL,
  `file_id` CHAR(36) NULL,
  `version_id` CHAR(36) NULL,
  `error` TEXT NULL,
  `started_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `cloud_import_jobs_org_id_user_id_status_idx` (`org_id`,`user_id`,`status`),
  KEY `cloud_import_jobs_connection_id_remote_file_id_idx` (`connection_id`,`remote_file_id`(191))
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `cloud_import_jobs` ADD CONSTRAINT `cloud_import_jobs_connection_id_fkey` FOREIGN KEY (`connection_id`) REFERENCES `cloud_connections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
