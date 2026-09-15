-- Add missing OrganizationMembership and DataTransfer tables
-- These models exist in the Prisma schema but were not created by earlier migrations

-- =====================================================================
-- 1. ORGANIZATION_MEMBERSHIPS
-- =====================================================================

CREATE TABLE `organization_memberships` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `organization_id` CHAR(36) NOT NULL,
  `role` ENUM('SUPER_ADMIN','ADMIN','MEMBER') NOT NULL DEFAULT 'MEMBER',
  `status` ENUM('ACTIVE','SUSPENDED','PENDING','REMOVED') NOT NULL DEFAULT 'ACTIVE',
  `joined_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `invited_by_id` CHAR(36) NULL,
  `is_primary` BOOLEAN NOT NULL DEFAULT FALSE,
  `personal_folder_id` CHAR(36) NULL,
  `suspended_at` DATETIME(3) NULL,
  `suspended_by_id` CHAR(36) NULL,
  `removed_at` DATETIME(3) NULL,
  `removed_by_id` CHAR(36) NULL,

  PRIMARY KEY (`id`),
  UNIQUE KEY `organization_memberships_user_id_organization_id_key` (`user_id`, `organization_id`),
  UNIQUE KEY `organization_memberships_personal_folder_id_key` (`personal_folder_id`),
  KEY `organization_memberships_organization_id_status_idx` (`organization_id`, `status`),
  KEY `organization_memberships_user_id_status_idx` (`user_id`, `status`),
  KEY `organization_memberships_user_id_is_primary_idx` (`user_id`, `is_primary`),
  CONSTRAINT `organization_memberships_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `organization_memberships_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `organization_memberships_invited_by_id_fkey` FOREIGN KEY (`invited_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `organization_memberships_suspended_by_id_fkey` FOREIGN KEY (`suspended_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `organization_memberships_removed_by_id_fkey` FOREIGN KEY (`removed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `organization_memberships_personal_folder_id_fkey` FOREIGN KEY (`personal_folder_id`) REFERENCES `folders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- =====================================================================
-- 2. DATA_TRANSFERS
-- =====================================================================

CREATE TABLE `data_transfers` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `source_member_id` CHAR(36) NOT NULL,
  `target_member_id` CHAR(36) NOT NULL,
  `initiated_by_id` CHAR(36) NOT NULL,
  `status` ENUM('PENDING','IN_PROGRESS','COMPLETED','PARTIAL','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `transfer_type` ENUM('FULL_OWNERSHIP','SELECTIVE_FILES','SELECTIVE_FOLDERS') NOT NULL DEFAULT 'FULL_OWNERSHIP',
  `items_total` INTEGER NOT NULL DEFAULT 0,
  `items_transferred` INTEGER NOT NULL DEFAULT 0,
  `items_failed` INTEGER NOT NULL DEFAULT 0,
  `error_log` JSON NULL,
  `started_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  KEY `data_transfers_org_id_status_idx` (`org_id`, `status`),
  KEY `data_transfers_org_id_source_member_id_idx` (`org_id`, `source_member_id`),
  KEY `data_transfers_org_id_target_member_id_idx` (`org_id`, `target_member_id`),
  CONSTRAINT `data_transfers_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `data_transfers_source_member_id_fkey` FOREIGN KEY (`source_member_id`) REFERENCES `organization_memberships`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `data_transfers_target_member_id_fkey` FOREIGN KEY (`target_member_id`) REFERENCES `organization_memberships`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `data_transfers_initiated_by_id_fkey` FOREIGN KEY (`initiated_by_id`) REFERENCES `users`(`id`) ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;