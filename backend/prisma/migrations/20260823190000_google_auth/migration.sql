ALTER TABLE `users` ADD COLUMN `google_id` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `users_google_id_key` ON `users`(`google_id`);
