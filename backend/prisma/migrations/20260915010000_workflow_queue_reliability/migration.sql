ALTER TABLE `workflow_jobs`
  ADD COLUMN `lease_until` DATETIME(3) NULL,
  ADD COLUMN `priority` INT NOT NULL DEFAULT 0,
  ADD COLUMN `idempotency_key` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `workflow_jobs_idempotency_key_key` ON `workflow_jobs` (`idempotency_key`);
CREATE INDEX `workflow_jobs_status_priority_run_at_idx` ON `workflow_jobs` (`status`, `priority`, `run_at`);
CREATE INDEX `workflow_jobs_lease_until_idx` ON `workflow_jobs` (`status`, `lease_until`);
