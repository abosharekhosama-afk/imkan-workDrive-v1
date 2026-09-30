ALTER TABLE `comments`
  ADD COLUMN `resolved_at` DATETIME(3) NULL,
  ADD COLUMN `resolved_by_id` CHAR(36) NULL;
