-- CreateTable
CREATE TABLE `team_folders` (
    `id` CHAR(36) NOT NULL,
    `org_id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `is_public_to_org` BOOLEAN NOT NULL DEFAULT false,

    INDEX `team_folders_org_id_idx`(`org_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `team_folder_members` (
    `team_folder_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `org_id` CHAR(36) NOT NULL,
    `role` ENUM('ADMIN', 'ORGANIZER', 'EDITOR', 'VIEWER') NOT NULL,

    INDEX `team_folder_members_org_id_idx`(`org_id`),
    PRIMARY KEY (`team_folder_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `team_folders` ADD CONSTRAINT `team_folders_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `team_folder_members` ADD CONSTRAINT `team_folder_members_team_folder_id_fkey` FOREIGN KEY (`team_folder_id`) REFERENCES `team_folders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `team_folder_members` ADD CONSTRAINT `team_folder_members_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `team_folder_members` ADD CONSTRAINT `team_folder_members_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
