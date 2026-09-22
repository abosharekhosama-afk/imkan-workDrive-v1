ALTER TABLE `connections`
  ADD COLUMN `link_name` VARCHAR(191) NULL,
  ADD COLUMN `connection_type` ENUM('USER','SYSTEM','ADMIN') NOT NULL DEFAULT 'USER';

UPDATE `connections`
SET `link_name` = CONCAT('connection_', REPLACE(`id`, '-', ''))
WHERE `link_name` IS NULL OR `link_name` = '';

ALTER TABLE `connections`
  MODIFY `link_name` VARCHAR(191) NOT NULL;

CREATE UNIQUE INDEX `connections_org_id_link_name_key` ON `connections`(`org_id`,`link_name`);
CREATE INDEX `connections_org_id_connection_type_status_idx` ON `connections`(`org_id`,`connection_type`,`status`);
