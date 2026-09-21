CREATE TABLE `office_document_policies` (
  `id` CHAR(36) NOT NULL,
  `document_id` CHAR(36) NOT NULL,
  `allow_export` BOOLEAN NOT NULL DEFAULT true,
  `allow_copy` BOOLEAN NOT NULL DEFAULT true,
  `allow_offline` BOOLEAN NOT NULL DEFAULT true,
  `read_only` BOOLEAN NOT NULL DEFAULT false,
  `watermark_enabled` BOOLEAN NOT NULL DEFAULT false,
  `watermark_text` VARCHAR(500) NULL,
  `updated_by_id` CHAR(36) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `office_document_policies_document_id_key` (`document_id`),
  INDEX `office_document_policies_updated_by_id_idx` (`updated_by_id`),
  CONSTRAINT `office_document_policies_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `office_documents` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `office_document_policies_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
