-- CreateTable
CREATE TABLE `integration_api_keys` (
    `id` CHAR(36) NOT NULL,
    `org_id` CHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `prefix` VARCHAR(32) NOT NULL,
    `secret_hash` CHAR(64) NOT NULL,
    `scopes` JSON NOT NULL,
    `root_folder_id` CHAR(36) NULL,
    `created_by_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_used_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NULL,

    UNIQUE INDEX `integration_api_keys_prefix_key`(`prefix`),
    INDEX `integration_api_keys_org_id_revoked_at_idx`(`org_id`, `revoked_at`),
    INDEX `integration_api_keys_created_by_id_idx`(`created_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `integration_api_keys` ADD CONSTRAINT `integration_api_keys_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `integration_api_keys` ADD CONSTRAINT `integration_api_keys_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

