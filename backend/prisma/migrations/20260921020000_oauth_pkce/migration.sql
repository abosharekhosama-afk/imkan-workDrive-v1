ALTER TABLE `connection_oauth_states`
  ADD COLUMN `code_verifier` TEXT NULL;

CREATE INDEX `connection_oauth_states_expires_at_idx`
  ON `connection_oauth_states`(`expires_at`);
