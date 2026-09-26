ALTER TABLE `cloud_connections`
  ADD COLUMN `generic_connection_id` CHAR(36) NULL;

CREATE INDEX `cloud_connections_generic_connection_id_idx`
  ON `cloud_connections`(`generic_connection_id`);
