-- IMKAN Office foundation: native office document metadata and editing sessions.
CREATE TABLE `office_documents` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `file_id` CHAR(36) NOT NULL,
  `type` ENUM('WRITER','SHEET','SHOW') NOT NULL,
  `native_format` VARCHAR(191) NOT NULL,
  `content` JSON NOT NULL,
  `revision` INT NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `office_documents_file_id_key` (`file_id`),
  INDEX `office_documents_org_id_type_idx` (`org_id`,`type`),
  INDEX `office_documents_org_id_updated_at_idx` (`org_id`,`updated_at`),
  CONSTRAINT `office_documents_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `office_documents_file_id_fkey` FOREIGN KEY (`file_id`) REFERENCES `files` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `office_sessions` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `file_id` CHAR(36) NOT NULL,
  `document_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `type` ENUM('WRITER','SHEET','SHOW') NOT NULL,
  `status` ENUM('ACTIVE','CLOSED') NOT NULL DEFAULT 'ACTIVE',
  `opened_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_activity_at` DATETIME(3) NOT NULL,
  `closed_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  INDEX `office_sessions_org_id_file_id_status_idx` (`org_id`,`file_id`,`status`),
  INDEX `office_sessions_org_id_user_id_status_idx` (`org_id`,`user_id`,`status`),
  INDEX `office_sessions_document_id_status_idx` (`document_id`,`status`),
  CONSTRAINT `office_sessions_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `office_sessions_file_id_fkey` FOREIGN KEY (`file_id`) REFERENCES `files` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `office_sessions_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `office_documents` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `office_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
