CREATE TABLE `connection_shares` (
  `id` CHAR(36) NOT NULL,
  `connection_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `role` ENUM('USE','MANAGE') NOT NULL DEFAULT 'USE',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `connection_shares_connection_id_user_id_key`(`connection_id`,`user_id`),
  INDEX `connection_shares_user_id_created_at_idx`(`user_id`,`created_at`),
  CONSTRAINT `connection_shares_connection_id_fkey` FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `connection_shares_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
