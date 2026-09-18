ALTER TABLE `connections` ADD COLUMN `expires_at` DATETIME(3) NULL, ADD COLUMN `scope` TEXT NULL;

CREATE TABLE `connection_oauth_states` (
  `id` CHAR(36) NOT NULL,
  `state_hash` CHAR(64) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `provider` VARCHAR(191) NOT NULL,
  `folder_id` CHAR(36) NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `used_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `connection_oauth_states_state_hash_key` (`state_hash`),
  INDEX `connection_oauth_states_org_id_user_id_expires_at_idx` (`org_id`,`user_id`,`expires_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
