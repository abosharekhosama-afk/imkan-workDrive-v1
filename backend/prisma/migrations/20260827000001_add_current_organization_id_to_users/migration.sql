-- Add current_organization_id column to users table
-- This column tracks the user's currently active organization context

-- 1. Add the column
ALTER TABLE `users` ADD COLUMN `current_organization_id` CHAR(36) NULL;

-- 2. Add foreign key constraint
ALTER TABLE `users` ADD CONSTRAINT `users_current_organization_id_fkey` 
  FOREIGN KEY (`current_organization_id`) REFERENCES `organizations`(`id`) 
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Add index for efficient lookups
CREATE INDEX `users_current_organization_id_idx` ON `users`(`current_organization_id`);