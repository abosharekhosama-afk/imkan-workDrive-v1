CREATE TABLE `organization_invitations` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `role` ENUM('ADMIN','MEMBER') NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `invited_by_id` CHAR(36) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `accepted_at` DATETIME(3) NULL,
  `revoked_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `organization_invitations_token_hash_key`(`token_hash`),
  INDEX `organization_invitations_org_id_email_accepted_at_revoked_at_idx`(`org_id`,`email`,`accepted_at`,`revoked_at`),
  CONSTRAINT `organization_invitations_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `organization_invitations_invited_by_id_fkey` FOREIGN KEY (`invited_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
