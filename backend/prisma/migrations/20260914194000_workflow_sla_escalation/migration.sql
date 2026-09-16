ALTER TABLE `workflow_tasks` ADD COLUMN `escalation_config` JSON NULL;
ALTER TABLE `workflow_tasks` ADD COLUMN `escalation_level` INT NOT NULL DEFAULT 0;
ALTER TABLE `workflow_tasks` ADD COLUMN `escalated_at` DATETIME(3) NULL;
