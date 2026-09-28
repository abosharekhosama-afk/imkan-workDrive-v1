CREATE TABLE `resource_follows` (
    `id` CHAR(36) NOT NULL,
    `org_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `resource_type` ENUM('FILE', 'FOLDER') NOT NULL,
    `resource_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `resource_follows_user_id_resource_type_resource_id_key`(`user_id`, `resource_type`, `resource_id`),
    INDEX `resource_follows_org_id_user_id_idx`(`org_id`, `user_id`),
    INDEX `resource_follows_org_id_resource_type_resource_id_idx`(`org_id`, `resource_type`, `resource_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `resource_follows` ADD CONSTRAINT `resource_follows_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `resource_follows` ADD CONSTRAINT `resource_follows_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
