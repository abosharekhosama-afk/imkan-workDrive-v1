-- V2 follow-up: storage object ownership is soft.
-- Copied/restored file versions share one physical StorageObject across
-- different files. A hard CASCADE from files would strand those versions
-- (FK RESTRICT) or delete bytes still in use. The owner link therefore
-- becomes nullable and is SET NULL when the creating file is purged.

-- DropForeignKey
ALTER TABLE `storage_objects` DROP FOREIGN KEY `storage_objects_file_id_fkey`;

-- AlterTable
ALTER TABLE `storage_objects` MODIFY `file_id` CHAR(36) NULL;

-- AddForeignKey
ALTER TABLE `storage_objects` ADD CONSTRAINT `storage_objects_file_id_fkey` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
