-- Phase 25: make presigned uploads explicitly pending until the physical
-- object has passed size + SHA-256 integrity verification. Existing versions
-- are historical completed data and are therefore backfilled as COMPLETE.
ALTER TABLE `file_versions`
  ADD COLUMN `upload_status` ENUM('PENDING','COMPLETE','ABORTED') NOT NULL DEFAULT 'COMPLETE' AFTER `status`;

CREATE INDEX `file_versions_file_id_upload_status_idx`
  ON `file_versions`(`file_id`, `upload_status`);

UPDATE `file_versions`
SET `upload_status` = 'COMPLETE'
WHERE `upload_status` IS NULL;
