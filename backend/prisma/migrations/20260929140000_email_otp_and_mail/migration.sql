ALTER TABLE `users`
  ADD COLUMN `email_verified_at` DATETIME(3) NULL;

UPDATE `users` SET `email_verified_at` = `created_at` WHERE `email_verified_at` IS NULL;

CREATE TABLE `email_otp_challenges` (
  `id` CHAR(36) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `user_id` CHAR(36) NULL,
  `purpose` ENUM('LOGIN', 'SIGNUP', 'PASSWORDLESS') NOT NULL,
  `code_hash` CHAR(64) NOT NULL,
  `payload` JSON NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `used_at` DATETIME(3) NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `email_otp_challenges_email_purpose_created_at_idx`(`email`, `purpose`, `created_at`),
  INDEX `email_otp_challenges_user_id_idx`(`user_id`),
  CONSTRAINT `email_otp_challenges_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
