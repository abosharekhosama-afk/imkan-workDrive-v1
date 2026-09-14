-- Add folder_type column to folders table
-- This column classifies folders as PERSONAL, TEAM_FOLDER_ROOT, etc.

-- 1. Add the column with default value
ALTER TABLE `folders` ADD COLUMN `folder_type` ENUM('PERSONAL','TEAM_FOLDER_ROOT','TEAM_FOLDER_SUB','SHARED_WITH_ME','ARCHIVED_MEMBER') NOT NULL DEFAULT 'PERSONAL';

-- 2. Add index for efficient lookups by folder type
CREATE INDEX `folders_org_id_folder_type_idx` ON `folders`(`org_id`, `folder_type`);