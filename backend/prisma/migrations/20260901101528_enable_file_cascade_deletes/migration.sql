/*
  Warnings:

  - You are about to drop the column `error_log` on the `data_transfers` table. All the data in the column will be lost.
  - You are about to drop the column `transfer_type` on the `data_transfers` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[folder_id,user_id,group_id]` on the table `folder_permissions` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[owner_id]` on the table `organizations` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[email]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE `data_transfers` DROP FOREIGN KEY `data_transfers_initiated_by_id_fkey`;

-- DropForeignKey
ALTER TABLE `data_transfers` DROP FOREIGN KEY `data_transfers_org_id_fkey`;

-- DropForeignKey
ALTER TABLE `data_transfers` DROP FOREIGN KEY `data_transfers_source_member_id_fkey`;

-- DropForeignKey
ALTER TABLE `data_transfers` DROP FOREIGN KEY `data_transfers_target_member_id_fkey`;

-- DropForeignKey
ALTER TABLE `file_versions` DROP FOREIGN KEY `file_versions_file_id_fkey`;

-- DropForeignKey
ALTER TABLE `files` DROP FOREIGN KEY `files_folder_id_fkey`;

-- DropForeignKey
ALTER TABLE `folders` DROP FOREIGN KEY `folders_parent_id_fkey`;

-- DropForeignKey
ALTER TABLE `groups` DROP FOREIGN KEY `groups_created_by_id_fkey`;

-- DropForeignKey
ALTER TABLE `retention_policies` DROP FOREIGN KEY `retention_policies_org_id_fkey`;

-- DropForeignKey
ALTER TABLE `trash_entries` DROP FOREIGN KEY `trash_entries_folder_id_fkey`;

-- DropIndex
DROP INDEX `data_transfers_initiated_by_id_fkey` ON `data_transfers`;

-- DropIndex
DROP INDEX `data_transfers_source_member_id_fkey` ON `data_transfers`;

-- DropIndex
DROP INDEX `data_transfers_target_member_id_fkey` ON `data_transfers`;

-- DropIndex
DROP INDEX `files_folder_id_fkey` ON `files`;

-- DropIndex
DROP INDEX `folders_parent_id_fkey` ON `folders`;

-- DropIndex
DROP INDEX `groups_created_by_id_fkey` ON `groups`;

-- AlterTable
ALTER TABLE `data_transfers` DROP COLUMN `error_log`,
    DROP COLUMN `transfer_type`,
    ADD COLUMN `errorLog` JSON NULL,
    ADD COLUMN `transferType` ENUM('FULL_OWNERSHIP', 'SELECTIVE_FILES', 'SELECTIVE_FOLDERS') NOT NULL DEFAULT 'FULL_OWNERSHIP';

-- AlterTable
ALTER TABLE `file_activities` MODIFY `action` ENUM('CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'MOVE', 'COPY', 'DOWNLOAD', 'PREVIEW', 'SHARE', 'UNSHARE', 'COMMENT', 'UPLOAD_VERSION', 'RESTORE_VERSION', 'LOGIN', 'LOGOUT', 'INVITE', 'ACCEPT_INVITATION', 'REVOKE_INVITATION', 'CHANGE_PERMISSION', 'OWNERSHIP_TRANSFERRED') NOT NULL;

-- AlterTable
ALTER TABLE `organization_invitations` MODIFY `role` ENUM('SUPER_ADMIN', 'ADMIN', 'MEMBER') NOT NULL;

-- AlterTable
ALTER TABLE `retention_policies` MODIFY `org_id` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `users` MODIFY `status` ENUM('INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED', 'REMOVED') NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE UNIQUE INDEX `folder_permissions_folder_id_user_id_group_id_key` ON `folder_permissions`(`folder_id`, `user_id`, `group_id`);

-- CreateIndex
CREATE UNIQUE INDEX `organizations_owner_id_key` ON `organizations`(`owner_id`);

-- CreateIndex
CREATE INDEX `users_email_idx` ON `users`(`email`);

-- CreateIndex
CREATE UNIQUE INDEX `users_email_key` ON `users`(`email`);

-- AddForeignKey
ALTER TABLE `folders` ADD CONSTRAINT `folders_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `folders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `files` ADD CONSTRAINT `files_folder_id_fkey` FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_versions` ADD CONSTRAINT `file_versions_file_id_fkey` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trash_entries` ADD CONSTRAINT `trash_entries_folder_id_fkey` FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `data_transfers` ADD CONSTRAINT `data_transfers_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `data_transfers` ADD CONSTRAINT `data_transfers_source_member_id_fkey` FOREIGN KEY (`source_member_id`) REFERENCES `organization_memberships`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `data_transfers` ADD CONSTRAINT `data_transfers_target_member_id_fkey` FOREIGN KEY (`target_member_id`) REFERENCES `organization_memberships`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `data_transfers` ADD CONSTRAINT `data_transfers_initiated_by_id_fkey` FOREIGN KEY (`initiated_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `groups` ADD CONSTRAINT `groups_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `retention_policies` ADD CONSTRAINT `retention_policies_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `files` RENAME INDEX `files_owner_id_fkey` TO `files_owner_id_idx`;

-- RenameIndex
ALTER TABLE `folders` RENAME INDEX `folders_owner_id_fkey` TO `folders_owner_id_idx`;

-- RenameIndex
ALTER TABLE `team_folder_members` RENAME INDEX `team_folder_members_user_id_fkey` TO `team_folder_members_user_id_idx`;
