-- AlterTable
ALTER TABLE `files` ALTER COLUMN `updated_at` DROP DEFAULT;

-- AlterTable
ALTER TABLE `folders` ALTER COLUMN `updated_at` DROP DEFAULT;

-- AlterTable
ALTER TABLE `organization_invitations` ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `users` ADD COLUMN `name` VARCHAR(191) NULL,
    ADD COLUMN `password_hash` VARCHAR(191) NULL;

-- RenameIndex
ALTER TABLE `files` RENAME INDEX `files_name_fulltext` TO `files_name_idx`;

-- RenameIndex
ALTER TABLE `folders` RENAME INDEX `folders_name_fulltext` TO `folders_name_idx`;
