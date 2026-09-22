ALTER TABLE `connection_usages` ADD COLUMN `error_code` VARCHAR(80) NULL;
ALTER TABLE `connection_usages` ADD COLUMN `http_status` INT NULL;
ALTER TABLE `connection_usages` ADD COLUMN `attempts` INT NOT NULL DEFAULT 1;
CREATE INDEX `connection_usages_org_id_connection_id_status_created_at_idx` ON `connection_usages`(`org_id`, `connection_id`, `status`, `created_at`);
