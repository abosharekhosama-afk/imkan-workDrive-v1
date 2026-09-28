ALTER TABLE `collection_submissions`
  ADD COLUMN `upload_version_id` CHAR(36) NULL;

CREATE UNIQUE INDEX `collection_submissions_upload_version_id_key`
  ON `collection_submissions` (`upload_version_id`);
