CREATE TABLE `workflows` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `owner_id` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `status` ENUM('DRAFT','ACTIVE') NOT NULL DEFAULT 'DRAFT',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `workflows_org_id_status_idx` (`org_id`, `status`),
  KEY `workflows_org_id_owner_id_idx` (`org_id`, `owner_id`),
  CONSTRAINT `workflows_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `workflows_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `workflow_steps` (
  `id` CHAR(36) NOT NULL,
  `workflow_id` CHAR(36) NOT NULL,
  `position` INTEGER NOT NULL,
  `kind` VARCHAR(32) NOT NULL,
  `config` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `workflow_steps_workflow_id_position_key` (`workflow_id`, `position`),
  KEY `workflow_steps_workflow_id_idx` (`workflow_id`),
  CONSTRAINT `workflow_steps_workflow_id_fkey` FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
