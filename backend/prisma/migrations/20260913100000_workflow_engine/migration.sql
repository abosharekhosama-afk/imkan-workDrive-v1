ALTER TABLE `workflows`
  ADD COLUMN `description` TEXT NULL,
  ADD COLUMN `mode` VARCHAR(32) NOT NULL DEFAULT 'AUTOMATIC',
  ADD COLUMN `resource_type` VARCHAR(32) NOT NULL DEFAULT 'FILE';

ALTER TABLE `workflow_runs`
  MODIFY `event_key` VARCHAR(128) NOT NULL,
  MODIFY `status` VARCHAR(32) NOT NULL DEFAULT 'QUEUED',
  ADD COLUMN `current_state_id` CHAR(36) NULL;

CREATE TABLE `workflow_states` (
  `id` CHAR(36) NOT NULL,
  `workflow_id` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `position` INT NOT NULL,
  `terminal` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `workflow_states_workflow_id_position_key` (`workflow_id`,`position`),
  KEY `workflow_states_workflow_id_idx` (`workflow_id`),
  CONSTRAINT `workflow_states_workflow_id_fkey` FOREIGN KEY (`workflow_id`) REFERENCES `workflows` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `workflow_transitions` (
  `id` CHAR(36) NOT NULL,
  `workflow_id` CHAR(36) NOT NULL,
  `from_state_id` CHAR(36) NOT NULL,
  `to_state_id` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `trigger` VARCHAR(64) NULL,
  `condition` JSON NULL,
  `actions` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `workflow_transitions_workflow_id_from_state_id_idx` (`workflow_id`,`from_state_id`),
  KEY `workflow_transitions_workflow_id_to_state_id_idx` (`workflow_id`,`to_state_id`),
  CONSTRAINT `workflow_transitions_workflow_id_fkey` FOREIGN KEY (`workflow_id`) REFERENCES `workflows` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `workflow_transitions_from_state_id_fkey` FOREIGN KEY (`from_state_id`) REFERENCES `workflow_states` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `workflow_transitions_to_state_id_fkey` FOREIGN KEY (`to_state_id`) REFERENCES `workflow_states` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `workflow_runs`
  ADD KEY `workflow_runs_status_started_at_idx` (`status`,`started_at`),
  ADD CONSTRAINT `workflow_runs_current_state_id_fkey` FOREIGN KEY (`current_state_id`) REFERENCES `workflow_states` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `workflow_jobs` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `workflow_id` CHAR(36) NOT NULL,
  `run_id` CHAR(36) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'QUEUED',
  `attempts` INT NOT NULL DEFAULT 0,
  `max_attempts` INT NOT NULL DEFAULT 5,
  `run_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `locked_at` DATETIME(3) NULL,
  `locked_by` VARCHAR(191) NULL,
  `last_error` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `workflow_jobs_status_run_at_idx` (`status`,`run_at`),
  KEY `workflow_jobs_org_id_created_at_idx` (`org_id`,`created_at`),
  KEY `workflow_jobs_workflow_id_created_at_idx` (`workflow_id`,`created_at`),
  CONSTRAINT `workflow_jobs_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `workflow_jobs_workflow_id_fkey` FOREIGN KEY (`workflow_id`) REFERENCES `workflows` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `workflow_jobs_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `workflow_runs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `workflow_tasks` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `workflow_id` CHAR(36) NOT NULL,
  `run_id` CHAR(36) NOT NULL,
  `state_id` CHAR(36) NOT NULL,
  `assignee_id` CHAR(36) NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  `title` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completed_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  KEY `workflow_tasks_org_id_status_assignee_id_idx` (`org_id`,`status`,`assignee_id`),
  KEY `workflow_tasks_run_id_idx` (`run_id`),
  CONSTRAINT `workflow_tasks_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `workflow_tasks_workflow_id_fkey` FOREIGN KEY (`workflow_id`) REFERENCES `workflows` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `workflow_tasks_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `workflow_runs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `workflow_tasks_state_id_fkey` FOREIGN KEY (`state_id`) REFERENCES `workflow_states` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `workflow_tasks_assignee_id_fkey` FOREIGN KEY (`assignee_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `workflow_step_runs` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `run_id` CHAR(36) NOT NULL,
  `step_kind` VARCHAR(64) NOT NULL,
  `step_position` INT NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'RUNNING',
  `input` JSON NULL,
  `output` JSON NULL,
  `error` TEXT NULL,
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finished_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  KEY `workflow_step_runs_org_id_run_id_started_at_idx` (`org_id`,`run_id`,`started_at`),
  CONSTRAINT `workflow_step_runs_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `workflow_runs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
