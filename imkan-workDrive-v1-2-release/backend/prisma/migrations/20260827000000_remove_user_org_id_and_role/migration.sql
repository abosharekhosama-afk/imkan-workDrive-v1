-- Corrective migration: Remove legacy org_id and role from users table
-- The canonical membership model uses OrganizationMembership

-- 1. Drop foreign key constraint on users.org_id
ALTER TABLE `users` DROP FOREIGN KEY `users_org_id_fkey`;

-- 2. Drop indexes that reference org_id
DROP INDEX `users_org_id_email_key` ON `users`;
DROP INDEX `users_org_id_idx` ON `users`;
DROP INDEX `users_org_id_status_idx` ON `users`;

-- 3. Drop the org_id column
ALTER TABLE `users` DROP COLUMN `org_id`;

-- 4. Drop the role column (role is now in OrganizationMembership)
ALTER TABLE `users` DROP COLUMN `role`;

-- 5. Update the unique index on email (was composite with org_id)
-- The unique index on email is already defined in the schema as @@unique([email])
-- We need to ensure it exists
-- Note: The unique constraint was already created by earlier migrations
-- This migration just cleans up the legacy columns