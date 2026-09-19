ALTER TABLE `connection_oauth_states` ADD COLUMN `connection_id` CHAR(36) NULL;
CREATE INDEX `connection_oauth_states_connection_id_idx` ON `connection_oauth_states`(`connection_id`);
ALTER TABLE `connection_oauth_states` ADD CONSTRAINT `connection_oauth_states_connection_id_fkey` FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
