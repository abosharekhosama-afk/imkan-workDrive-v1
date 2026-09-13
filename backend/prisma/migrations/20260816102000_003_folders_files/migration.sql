-- CreateTable
CREATE TABLE `folders` (
    `id` CHAR(36) NOT NULL,
    `org_id` CHAR(36) NOT NULL,
    `team_folder_id` CHAR(36) NULL,
    `parent_id` CHAR(36) NULL,
    `name` VARCHAR(191) NOT NULL,
    `owner_id` CHAR(36) NOT NULL,

    INDEX `folders_org_id_parent_id_idx`(`org_id`, `parent_id`),
    INDEX `folders_org_id_team_folder_id_idx`(`org_id`, `team_folder_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `files` (
    `id` CHAR(36) NOT NULL,
    `org_id` CHAR(36) NOT NULL,
    `folder_id` CHAR(36) NULL,
    `name` VARCHAR(191) NOT NULL,
    `owner_id` CHAR(36) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `files_org_id_folder_id_idx`(`org_id`, `folder_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `file_versions` (
    `id` CHAR(36) NOT NULL,
    `org_id` CHAR(36) NOT NULL,
    `file_id` CHAR(36) NOT NULL,
    `version_number` INTEGER NOT NULL,
    `s3_key` VARCHAR(191) NOT NULL,
    `size` BIGINT NOT NULL,
    `mime_type` VARCHAR(191) NOT NULL,
    `sha256_hash` CHAR(64) NOT NULL,
    `uploaded_by` CHAR(36) NOT NULL,

    UNIQUE INDEX `file_versions_file_id_version_number_key`(`file_id`, `version_number`),
    INDEX `file_versions_org_id_sha256_hash_idx`(`org_id`, `sha256_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `folders` ADD CONSTRAINT `folders_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `folders` ADD CONSTRAINT `folders_team_folder_id_fkey` FOREIGN KEY (`team_folder_id`) REFERENCES `team_folders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `folders` ADD CONSTRAINT `folders_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `folders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `folders` ADD CONSTRAINT `folders_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `files` ADD CONSTRAINT `files_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `files` ADD CONSTRAINT `files_folder_id_fkey` FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `files` ADD CONSTRAINT `files_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_versions` ADD CONSTRAINT `file_versions_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_versions` ADD CONSTRAINT `file_versions_file_id_fkey` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_versions` ADD CONSTRAINT `file_versions_uploaded_by_fkey` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
