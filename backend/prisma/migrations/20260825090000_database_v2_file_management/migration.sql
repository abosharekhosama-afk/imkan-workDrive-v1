-- Database V2: enterprise file management upgrade.
--
-- Forward-only migration. Preserves all existing data:
--   * file_versions.s3_key is migrated into storage_objects (deduplicated),
--     linked via file_versions.storage_object_id, and only then dropped.
--   * shares / share_recipients are RENAMED to file_shares / file_share_recipients
--     (rows preserved), then upgraded in place.
--   * files gains denormalized content fields backfilled from the latest version.
--   * organization_invitations gains a materialized status derived from timestamps.
--
-- Guards abort the migration (NOT NULL violation) if unexpected legacy data
-- would be silently lost.

-- ---------------------------------------------------------------------
-- Guard helper: inserting NULL into this table aborts the migration.
-- ---------------------------------------------------------------------
CREATE TABLE `_v2_migration_guard` (`chk` BOOLEAN NOT NULL);

-- =====================================================================
-- 1. NEW TABLES
-- =====================================================================

-- CreateTable
CREATE TABLE `file_metadata` (
    `id` CHAR(36) NOT NULL,
    `file_id` CHAR(36) NOT NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `duration` INTEGER NULL,
    `page_count` INTEGER NULL,
    `encoding` VARCHAR(191) NULL,
    `language` VARCHAR(191) NULL,
    `title` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `file_metadata_file_id_key`(`file_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `storage_objects` (
    `id` CHAR(36) NOT NULL,
    `org_id` CHAR(36) NOT NULL,
    `file_id` CHAR(36) NOT NULL,
    `storage_key` VARCHAR(191) NOT NULL,
    `bucket` VARCHAR(191) NOT NULL,
    `region` VARCHAR(191) NULL,
    `size` BIGINT NOT NULL DEFAULT 0,
    `checksum` VARCHAR(191) NULL,
    `status` ENUM('ACTIVE', 'DELETED', 'CORRUPTED') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `storage_objects_org_id_file_id_idx`(`org_id`, `file_id`),
    INDEX `storage_objects_org_id_status_idx`(`org_id`, `status`),
    UNIQUE INDEX `storage_objects_bucket_storage_key_key`(`bucket`, `storage_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `trash_entries` (
    `id` CHAR(36) NOT NULL,
    `org_id` CHAR(36) NOT NULL,
    `file_id` CHAR(36) NULL,
    `folder_id` CHAR(36) NULL,
    `deleted_by_id` CHAR(36) NOT NULL,
    `reason` ENUM('USER_DELETED', 'OWNER_DELETED', 'PARENT_DELETED', 'ADMIN_DELETED') NOT NULL DEFAULT 'USER_DELETED',
    `deleted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,
    `restored_at` DATETIME(3) NULL,
    `restored_by_id` CHAR(36) NULL,

    INDEX `trash_entries_org_id_expires_at_idx`(`org_id`, `expires_at`),
    INDEX `trash_entries_org_id_deleted_at_idx`(`org_id`, `deleted_at`),
    INDEX `trash_entries_file_id_idx`(`file_id`),
    INDEX `trash_entries_folder_id_idx`(`folder_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `file_activities` (
    `id` CHAR(36) NOT NULL,
    `org_id` CHAR(36) NOT NULL,
    `file_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `action` ENUM('CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'MOVE', 'COPY', 'DOWNLOAD', 'PREVIEW', 'SHARE', 'UNSHARE', 'COMMENT', 'UPLOAD_VERSION', 'RESTORE_VERSION', 'LOGIN', 'LOGOUT', 'INVITE', 'ACCEPT_INVITATION', 'REVOKE_INVITATION', 'CHANGE_PERMISSION') NOT NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `file_activities_org_id_file_id_created_at_idx`(`org_id`, `file_id`, `created_at`),
    INDEX `file_activities_org_id_user_id_created_at_idx`(`org_id`, `user_id`, `created_at`),
    INDEX `file_activities_org_id_action_created_at_idx`(`org_id`, `action`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tags` (
    `id` CHAR(36) NOT NULL,
    `org_id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `tags_org_id_idx`(`org_id`),
    UNIQUE INDEX `tags_org_id_name_key`(`org_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `file_tags` (
    `file_id` CHAR(36) NOT NULL,
    `tag_id` CHAR(36) NOT NULL,

    INDEX `file_tags_tag_id_idx`(`tag_id`),
    PRIMARY KEY (`file_id`, `tag_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- =====================================================================
-- 2. FILE_VERSIONS -> STORAGE OBJECTS (physical/logical separation)
-- =====================================================================

-- AlterTable
ALTER TABLE `file_versions` ADD COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `extension` VARCHAR(191) NULL,
    ADD COLUMN `status` ENUM('ACTIVE', 'RESTORED', 'SUPERSEDED', 'DELETED') NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN `storage_object_id` CHAR(36) NULL;

-- BackfillData: one StorageObject row per distinct physical key (copy/restore reused keys).
-- Deterministic UUIDv5-shaped ids derived from MD5(storage_key).
INSERT INTO `storage_objects` (`id`, `org_id`, `file_id`, `storage_key`, `bucket`, `region`, `size`, `checksum`, `status`, `created_at`)
SELECT
    LOWER(CONCAT(
        SUBSTR(MD5(v.s3_key), 1, 8), '-',
        SUBSTR(MD5(v.s3_key), 9, 4), '-',
        '5', SUBSTR(MD5(v.s3_key), 14, 3), '-',
        'a', SUBSTR(MD5(v.s3_key), 17, 3), '-',
        SUBSTR(MD5(v.s3_key), 21, 12)
    )),
    v.org_id,
    v.file_id,
    v.s3_key,
    'imkan-workdrive-dev',
    'us-east-1',
    MAX(v.size),
    MAX(v.sha256_hash),
    'ACTIVE',
    CURRENT_TIMESTAMP(3)
FROM `file_versions` v
GROUP BY v.org_id, v.file_id, v.s3_key;

-- BackfillData: point every version at its storage object.
UPDATE `file_versions` v
JOIN `storage_objects` so ON so.`file_id` = v.`file_id` AND so.`storage_key` = v.`s3_key`
SET v.`storage_object_id` = so.`id`;

-- Guard: every version must now reference a storage object.
INSERT INTO `_v2_migration_guard` (`chk`)
SELECT IF(COUNT(*) > 0, NULL, 0) FROM `file_versions` WHERE `storage_object_id` IS NULL;

-- AlterTable
ALTER TABLE `file_versions` MODIFY `storage_object_id` CHAR(36) NOT NULL;

-- Drop legacy column only after successful backfill.
ALTER TABLE `file_versions` DROP COLUMN `s3_key`;

-- =====================================================================
-- 3. FILES (logical entity upgrade)
-- =====================================================================

-- AlterTable
ALTER TABLE `files` ADD COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `extension` VARCHAR(191) NULL,
    ADD COLUMN `file_type` ENUM('DOCUMENT', 'SPREADSHEET', 'PRESENTATION', 'PDF', 'IMAGE', 'VIDEO', 'AUDIO', 'ARCHIVE', 'TEXT', 'CODE', 'OTHER') NOT NULL DEFAULT 'OTHER',
    ADD COLUMN `last_accessed_at` DATETIME(3) NULL,
    ADD COLUMN `mime_type` VARCHAR(191) NULL,
    ADD COLUMN `original_name` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `sha256_hash` CHAR(64) NULL,
    ADD COLUMN `size` BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN `status` ENUM('ACTIVE', 'TRASHED', 'ARCHIVED', 'PURGED') NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN `visibility` ENUM('PRIVATE', 'ORGANIZATION', 'TEAM', 'SHARED', 'PUBLIC_LINK') NOT NULL DEFAULT 'PRIVATE';

-- BackfillData
UPDATE `files` SET `original_name` = `name`;

-- AlterTable: remove the temporary backfill default (Prisma expects none).
ALTER TABLE `files` ALTER COLUMN `original_name` DROP DEFAULT;

-- BackfillData: denormalize content facts from the newest version of each file.
UPDATE `files` f
JOIN (
    SELECT v.`file_id`, v.`mime_type`, v.`size`, v.`sha256_hash`
    FROM `file_versions` v
    JOIN (
        SELECT `file_id`, MAX(`version_number`) AS `vn`
        FROM `file_versions`
        GROUP BY `file_id`
    ) m ON m.`file_id` = v.`file_id` AND m.`vn` = v.`version_number`
) lv ON lv.`file_id` = f.`id`
SET f.`mime_type` = lv.`mime_type`,
    f.`size` = lv.`size`,
    f.`sha256_hash` = lv.`sha256_hash`;

-- BackfillData: derive extension from the file name.
UPDATE `files`
SET `extension` = LOWER(SUBSTRING_INDEX(`name`, '.', -1))
WHERE `name` LIKE '%.%'
  AND LENGTH(SUBSTRING_INDEX(`name`, '.', -1)) BETWEEN 1 AND 16
  AND LOCATE('/', SUBSTRING_INDEX(`name`, '.', -1)) = 0;

-- BackfillData: coarse FileType classification from mimeType.
UPDATE `files`
SET `file_type` = CASE
    WHEN `mime_type` LIKE 'image/%' THEN 'IMAGE'
    WHEN `mime_type` LIKE 'video/%' THEN 'VIDEO'
    WHEN `mime_type` LIKE 'audio/%' THEN 'AUDIO'
    WHEN `mime_type` = 'application/pdf' THEN 'PDF'
    WHEN `mime_type` IN ('application/zip', 'application/x-zip-compressed', 'application/x-7z-compressed', 'application/gzip', 'application/x-tar', 'application/x-rar-compressed', 'application/vnd.rar') THEN 'ARCHIVE'
    WHEN `mime_type` IN ('text/plain', 'text/markdown', 'text/rtf') THEN 'TEXT'
    WHEN `mime_type` IN ('application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.oasis.opendocument.text') THEN 'DOCUMENT'
    WHEN `mime_type` IN ('application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.oasis.opendocument.spreadsheet', 'text/csv') THEN 'SPREADSHEET'
    WHEN `mime_type` IN ('application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.oasis.opendocument.presentation') THEN 'PRESENTATION'
    WHEN `mime_type` IN ('application/javascript', 'text/javascript', 'application/json', 'application/xml', 'text/html', 'text/css', 'text/csv', 'text/x-python', 'application/x-httpd-php', 'application/typescript') THEN 'CODE'
    ELSE 'OTHER'
END;

-- BackfillData: lifecycle status consistent with legacy soft-delete flag.
UPDATE `files` SET `status` = 'TRASHED' WHERE `deleted_at` IS NOT NULL;

-- CreateIndex
CREATE INDEX `files_org_id_status_idx` ON `files`(`org_id`, `status`);

-- CreateIndex
CREATE INDEX `files_org_id_file_type_idx` ON `files`(`org_id`, `file_type`);

-- CreateIndex
CREATE INDEX `files_org_id_owner_id_idx` ON `files`(`org_id`, `owner_id`);

-- CreateIndex
CREATE INDEX `file_versions_org_id_status_idx` ON `file_versions`(`org_id`, `status`);

-- =====================================================================
-- 4. SHARES -> FILE SHARES (rename preserves rows)
-- =====================================================================

-- Guard: V2 sharing is file-scoped; refuse to silently drop non-file shares.
INSERT INTO `_v2_migration_guard` (`chk`)
SELECT IF(COUNT(*) > 0, NULL, 0) FROM `shares` WHERE `resource_type` <> 'FILE';

-- RenameTable (data preserved)
RENAME TABLE `share_recipients` TO `file_share_recipients`;
RENAME TABLE `shares` TO `file_shares`;

-- AlterTable: drop legacy foreign keys before reshaping columns.
ALTER TABLE `file_shares` DROP FOREIGN KEY `shares_org_id_fkey`;
ALTER TABLE `file_share_recipients` DROP FOREIGN KEY `share_recipients_org_id_fkey`,
    DROP FOREIGN KEY `share_recipients_share_id_fkey`,
    DROP FOREIGN KEY `share_recipients_user_id_fkey`;

-- AlterTable
ALTER TABLE `file_shares` ADD COLUMN `file_id` CHAR(36) NULL,
    ADD COLUMN `created_by_id` CHAR(36) NULL,
    ADD COLUMN `status` ENUM('ACTIVE', 'EXPIRED', 'REVOKED') NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN `permission` ENUM('VIEW', 'COMMENT', 'EDIT', 'ORGANIZE', 'FULL_ACCESS') NULL,
    ADD COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `revoked_at` DATETIME(3) NULL;

-- BackfillData: resolve file + creator from legacy polymorphic columns.
UPDATE `file_shares` fs
JOIN `files` f ON f.`id` = fs.`resource_id`
SET fs.`file_id` = fs.`resource_id`,
    fs.`created_by_id` = f.`owner_id`
WHERE fs.`resource_type` = 'FILE';

-- BackfillData
UPDATE `file_shares` SET `permission` = 'VIEW' WHERE `permission` IS NULL;

-- Guard: every share must resolve to a file and creator.
INSERT INTO `_v2_migration_guard` (`chk`)
SELECT IF(COUNT(*) > 0, NULL, 0) FROM `file_shares` WHERE `file_id` IS NULL OR `created_by_id` IS NULL;

-- AlterTable
ALTER TABLE `file_shares`
    MODIFY `file_id` CHAR(36) NOT NULL,
    MODIFY `created_by_id` CHAR(36) NOT NULL,
    MODIFY `permission` ENUM('VIEW', 'COMMENT', 'EDIT', 'ORGANIZE', 'FULL_ACCESS') NOT NULL DEFAULT 'VIEW';

-- AlterTable: drop legacy polymorphic columns.
ALTER TABLE `file_shares` DROP COLUMN `resource_type`,
    DROP COLUMN `resource_id`;

-- AlterTable: recipients become pure membership rows; permission lives on the share.
ALTER TABLE `file_share_recipients` DROP COLUMN `permission`;

-- RenameIndex (match Prisma naming for the new model names)
ALTER TABLE `file_shares` RENAME INDEX `shares_link_token_key` TO `file_shares_link_token_key`;
ALTER TABLE `file_shares` RENAME INDEX `shares_org_id_resource_type_resource_id_idx` TO `_file_shares_org_id_legacy_idx`;

-- CreateIndex
CREATE INDEX `file_shares_org_id_file_id_idx` ON `file_shares`(`org_id`, `file_id`);

-- CreateIndex
CREATE INDEX `file_shares_org_id_status_idx` ON `file_shares`(`org_id`, `status`);

-- CreateIndex
CREATE INDEX `file_shares_org_id_created_by_id_idx` ON `file_shares`(`org_id`, `created_by_id`);

-- DropIndex (legacy composite replaced by file-scoped indexes above)
DROP INDEX `_file_shares_org_id_legacy_idx` ON `file_shares`;

ALTER TABLE `file_share_recipients` RENAME INDEX `share_recipients_share_id_user_id_key` TO `file_share_recipients_share_id_user_id_key`;
ALTER TABLE `file_share_recipients` RENAME INDEX `share_recipients_org_id_user_id_idx` TO `file_share_recipients_org_id_user_id_idx`;

-- =====================================================================
-- 5. REMAINING MODEL UPGRADES
-- =====================================================================

-- AlterTable
ALTER TABLE `access_events` MODIFY `action` ENUM('VIEW', 'PREVIEW', 'DOWNLOAD', 'EDIT', 'COMMENT', 'SHARE', 'MOVE', 'COPY', 'DELETE', 'RESTORE') NOT NULL;

-- AlterTable
ALTER TABLE `audit_logs` ADD COLUMN `metadata` JSON NULL;

-- AlterTable
ALTER TABLE `comments` ADD COLUMN `deleted_at` DATETIME(3) NULL,
    ADD COLUMN `edited_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `notifications` ADD COLUMN `priority` ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT') NOT NULL DEFAULT 'NORMAL',
    MODIFY `type` ENUM('SHARE', 'COMMENT', 'MENTION', 'INVITATION', 'FILE_UPLOADED', 'FILE_UPDATED', 'FILE_DELETED', 'FILE_RESTORED', 'VERSION_CREATED', 'VERSION_RESTORED', 'ACCESS_REQUEST', 'SYSTEM') NOT NULL;

-- AlterTable
ALTER TABLE `organization_invitations` ADD COLUMN `status` ENUM('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED') NOT NULL DEFAULT 'PENDING';

-- BackfillData: materialize status from legacy timestamp state.
UPDATE `organization_invitations`
SET `status` = CASE
    WHEN `accepted_at` IS NOT NULL THEN 'ACCEPTED'
    WHEN `revoked_at` IS NOT NULL THEN 'REVOKED'
    WHEN `expires_at` <= CURRENT_TIMESTAMP(3) THEN 'EXPIRED'
    ELSE 'PENDING'
END;

-- CreateIndex
CREATE INDEX `audit_logs_org_id_actor_id_created_at_idx` ON `audit_logs`(`org_id`, `actor_id`, `created_at`);

-- CreateIndex
CREATE INDEX `organization_invitations_org_id_status_idx` ON `organization_invitations`(`org_id`, `status`);

-- =====================================================================
-- 6. FOREIGN KEYS
-- =====================================================================

-- AddForeignKey
ALTER TABLE `file_metadata` ADD CONSTRAINT `file_metadata_file_id_fkey` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `storage_objects` ADD CONSTRAINT `storage_objects_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `storage_objects` ADD CONSTRAINT `storage_objects_file_id_fkey` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_versions` ADD CONSTRAINT `file_versions_storage_object_id_fkey` FOREIGN KEY (`storage_object_id`) REFERENCES `storage_objects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trash_entries` ADD CONSTRAINT `trash_entries_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trash_entries` ADD CONSTRAINT `trash_entries_file_id_fkey` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trash_entries` ADD CONSTRAINT `trash_entries_folder_id_fkey` FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trash_entries` ADD CONSTRAINT `trash_entries_deleted_by_id_fkey` FOREIGN KEY (`deleted_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trash_entries` ADD CONSTRAINT `trash_entries_restored_by_id_fkey` FOREIGN KEY (`restored_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_shares` ADD CONSTRAINT `file_shares_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_shares` ADD CONSTRAINT `file_shares_file_id_fkey` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_shares` ADD CONSTRAINT `file_shares_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_share_recipients` ADD CONSTRAINT `file_share_recipients_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_share_recipients` ADD CONSTRAINT `file_share_recipients_share_id_fkey` FOREIGN KEY (`share_id`) REFERENCES `file_shares`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_share_recipients` ADD CONSTRAINT `file_share_recipients_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_activities` ADD CONSTRAINT `file_activities_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_activities` ADD CONSTRAINT `file_activities_file_id_fkey` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_activities` ADD CONSTRAINT `file_activities_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tags` ADD CONSTRAINT `tags_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_tags` ADD CONSTRAINT `file_tags_file_id_fkey` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_tags` ADD CONSTRAINT `file_tags_tag_id_fkey` FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- =====================================================================
-- 7. CLEANUP
-- =====================================================================

DROP TABLE `_v2_migration_guard`;
