ALTER TABLE `file_shares` ADD COLUMN `download_limit` INT NULL, ADD COLUMN `download_count` INT NOT NULL DEFAULT 0, ADD COLUMN `request_user_data` JSON NULL;
ALTER TABLE `folder_shares` ADD COLUMN `download_limit` INT NULL, ADD COLUMN `download_count` INT NOT NULL DEFAULT 0, ADD COLUMN `request_user_data` JSON NULL;
