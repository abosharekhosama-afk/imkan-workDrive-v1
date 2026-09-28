CREATE TABLE `file_collections` (
 `id` CHAR(36) NOT NULL, `org_id` CHAR(36) NOT NULL, `created_by_id` CHAR(36) NOT NULL,
 `folder_id` CHAR(36) NOT NULL, `name` VARCHAR(180) NOT NULL, `description` TEXT NULL,
 `type` VARCHAR(20) NOT NULL DEFAULT 'EXTERNAL', `token_hash` CHAR(64) NOT NULL,
 `status` VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', `expires_at` DATETIME(3) NULL,
 `max_files` INTEGER NULL, `max_file_size_bytes` BIGINT NULL,
 `collect_name` BOOLEAN NOT NULL DEFAULT true, `collect_email` BOOLEAN NOT NULL DEFAULT false,
 `separate_folder_per_user` BOOLEAN NOT NULL DEFAULT false,
 `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`), UNIQUE INDEX `file_collections_token_hash_key` (`token_hash`),
 INDEX `file_collections_org_id_status_created_at_idx` (`org_id`,`status`,`created_at`),
 CONSTRAINT `file_collections_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT `file_collections_folder_id_fkey` FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `collection_submissions` (
 `id` CHAR(36) NOT NULL, `collection_id` CHAR(36) NOT NULL, `submitter_name` VARCHAR(180) NULL,
 `submitter_email` VARCHAR(320) NULL, `file_count` INTEGER NOT NULL DEFAULT 0,
 `status` VARCHAR(20) NOT NULL DEFAULT 'RECEIVED', `submitted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`), INDEX `collection_submissions_collection_id_submitted_at_idx` (`collection_id`,`submitted_at`),
 CONSTRAINT `collection_submissions_collection_id_fkey` FOREIGN KEY (`collection_id`) REFERENCES `file_collections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
