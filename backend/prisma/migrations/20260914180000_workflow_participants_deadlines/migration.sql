ALTER TABLE `workflow_tasks`
  ADD COLUMN `transition_id` CHAR(36) NULL,
  ADD COLUMN `approval_policy` VARCHAR(32) NOT NULL DEFAULT 'ANY',
  ADD COLUMN `due_at` DATETIME(3) NULL,
  ADD COLUMN `reminder_at` DATETIME(3) NULL,
  ADD COLUMN `reminder_sent_at` DATETIME(3) NULL,
  ADD COLUMN `overdue_notified_at` DATETIME(3) NULL,
  ADD COLUMN `priority` VARCHAR(16) NOT NULL DEFAULT 'NORMAL',
  ADD KEY `workflow_tasks_org_id_status_due_at_idx` (`org_id`,`status`,`due_at`),
  ADD KEY `workflow_tasks_org_id_reminder_at_reminder_sent_at_idx` (`org_id`,`reminder_at`,`reminder_sent_at`),
  ADD CONSTRAINT `workflow_tasks_transition_id_fkey` FOREIGN KEY (`transition_id`) REFERENCES `workflow_transitions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `workflow_task_participants` (
  `id` CHAR(36) NOT NULL,
  `task_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  `responded_at` DATETIME(3) NULL,
  `comment` TEXT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `workflow_task_participants_task_id_user_id_key` (`task_id`,`user_id`),
  KEY `workflow_task_participants_user_id_status_idx` (`user_id`,`status`),
  CONSTRAINT `workflow_task_participants_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `workflow_tasks` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `workflow_task_participants_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
