ALTER TABLE `file_collections`
  ADD COLUMN `notes` TEXT NULL,
  ADD COLUMN `collect_phone` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `same_name_as_version` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `notify_on_submission` BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE `collection_submissions`
  ADD COLUMN `submitter_phone` VARCHAR(40) NULL;
