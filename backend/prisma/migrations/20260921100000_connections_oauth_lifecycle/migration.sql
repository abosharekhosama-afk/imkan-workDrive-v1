ALTER TABLE `connections`
  MODIFY `status` ENUM('PENDING_AUTH','ACTIVE','REAUTH_REQUIRED','DISABLED','ERROR') NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE `connection_oauth_states`
  ADD COLUMN `return_path` VARCHAR(2000) NULL;

CREATE INDEX `connection_oauth_states_return_path_idx`
  ON `connection_oauth_states`(`return_path`(191));
