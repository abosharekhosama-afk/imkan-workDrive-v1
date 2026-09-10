-- Adds a physical storage pointer onto `files` so version restore can mirror
-- the restored version's storage attributes and preview/stream/download resolve
-- the real historical bytes (fixes preview corruption after restore).
ALTER TABLE `files`
  ADD COLUMN `storage_key` VARCHAR(191) NULL,
  ADD COLUMN `storage_object_id` CHAR(36) NULL;