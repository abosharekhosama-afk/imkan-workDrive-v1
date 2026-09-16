ALTER TABLE `workflow_functions` ADD COLUMN `active_version_id` CHAR(36) NULL;
CREATE TABLE `workflow_function_versions` (
 `id` CHAR(36) NOT NULL, `function_id` CHAR(36) NOT NULL, `org_id` CHAR(36) NOT NULL,
 `version` INT NOT NULL, `status` VARCHAR(32) NOT NULL DEFAULT 'DRAFT', `runtime` VARCHAR(32) NOT NULL DEFAULT 'SAFE',
 `definition` JSON NOT NULL, `input_schema` JSON NULL, `output_schema` JSON NULL, `permissions` JSON NULL,
 `timeout_ms` INT NOT NULL DEFAULT 1000, `memory_limit_mb` INT NOT NULL DEFAULT 64, `created_by_id` CHAR(36) NOT NULL,
 `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `published_at` DATETIME(3) NULL,
 UNIQUE INDEX `workflow_function_versions_function_id_version_key` (`function_id`,`version`),
 INDEX `workflow_function_versions_org_id_function_id_status_idx` (`org_id`,`function_id`,`status`), PRIMARY KEY (`id`),
 CONSTRAINT `workflow_function_versions_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT `workflow_function_versions_function_id_fkey` FOREIGN KEY (`function_id`) REFERENCES `workflow_functions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT `workflow_function_versions_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `workflow_function_executions` (
 `id` CHAR(36) NOT NULL, `org_id` CHAR(36) NOT NULL, `function_id` CHAR(36) NOT NULL, `version_id` CHAR(36) NOT NULL,
 `run_id` CHAR(36) NULL, `step_id` CHAR(36) NULL, `status` VARCHAR(32) NOT NULL, `duration_ms` INT NULL,
 `input_summary` JSON NULL, `output_summary` JSON NULL, `error` TEXT NULL, `idempotency_key` VARCHAR(191) NULL,
 `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `completed_at` DATETIME(3) NULL,
 UNIQUE INDEX `workflow_function_executions_idempotency_key_key` (`idempotency_key`),
 INDEX `workflow_function_executions_org_id_function_id_created_at_idx` (`org_id`,`function_id`,`created_at`),
 INDEX `workflow_function_executions_run_id_created_at_idx` (`run_id`,`created_at`), PRIMARY KEY (`id`),
 CONSTRAINT `workflow_function_executions_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT `workflow_function_executions_function_id_fkey` FOREIGN KEY (`function_id`) REFERENCES `workflow_functions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT `workflow_function_executions_version_id_fkey` FOREIGN KEY (`version_id`) REFERENCES `workflow_function_versions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `workflow_functions` ADD UNIQUE INDEX `workflow_functions_active_version_id_key` (`active_version_id`), ADD CONSTRAINT `workflow_functions_active_version_id_fkey` FOREIGN KEY (`active_version_id`) REFERENCES `workflow_function_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
INSERT INTO `workflow_function_versions` (`id`,`function_id`,`org_id`,`version`,`status`,`runtime`,`definition`,`permissions`,`created_by_id`,`published_at`)
SELECT UUID(), f.id, f.org_id, 1, 'ACTIVE', 'SAFE', JSON_OBJECT('operations', JSON_ARRAY(JSON_OBJECT('op','BUILT_IN','key',f.`key`))), JSON_ARRAY('read_file_metadata','read_workflow_fields','write_workflow_fields','notify_owner','add_tags'), f.created_by_id, CURRENT_TIMESTAMP(3) FROM `workflow_functions` f;
UPDATE `workflow_functions` f JOIN `workflow_function_versions` v ON v.function_id=f.id AND v.version=1 SET f.active_version_id=v.id;
