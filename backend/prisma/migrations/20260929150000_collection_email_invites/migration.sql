CREATE TABLE `collection_email_invites` (
  `id` CHAR(36) NOT NULL,
  `collection_id` CHAR(36) NOT NULL,
  `email` VARCHAR(320) NOT NULL,
  `message` TEXT NULL,
  `delivered` BOOLEAN NOT NULL DEFAULT false,
  `sent_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `collection_email_invites_collection_id_sent_at_idx`(`collection_id`, `sent_at`),
  CONSTRAINT `collection_email_invites_collection_id_fkey` FOREIGN KEY (`collection_id`) REFERENCES `file_collections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
