ALTER TABLE `collection_submissions` ADD COLUMN `file_id` CHAR(36) NULL;
CREATE INDEX `collection_submissions_file_id_idx` ON `collection_submissions` (`file_id`);
