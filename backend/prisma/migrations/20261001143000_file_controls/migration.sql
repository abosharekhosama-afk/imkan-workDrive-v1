ALTER TABLE `files`
  ADD COLUMN `is_final` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `checked_out_by_id` CHAR(36) NULL,
  ADD COLUMN `checked_out_at` DATETIME(3) NULL,
  ADD COLUMN `indexed_at` DATETIME(3) NULL,
  ADD INDEX `files_org_id_is_final_idx` (`org_id`, `is_final`),
  ADD INDEX `files_checked_out_by_id_idx` (`checked_out_by_id`);
