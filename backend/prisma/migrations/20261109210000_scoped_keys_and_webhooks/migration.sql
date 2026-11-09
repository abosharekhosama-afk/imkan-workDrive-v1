ALTER TABLE `integration_api_keys`
  ADD COLUMN `parent_key_id` CHAR(36) NULL,
  ADD COLUMN `quota_bytes` BIGINT NULL;

CREATE INDEX `integration_api_keys_parent_key_id_idx` ON `integration_api_keys`(`parent_key_id`);

ALTER TABLE `integration_api_keys`
  ADD CONSTRAINT `integration_api_keys_parent_key_id_fkey`
  FOREIGN KEY (`parent_key_id`) REFERENCES `integration_api_keys`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `integration_webhooks` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `key_id` CHAR(36) NULL,
  `url` VARCHAR(2048) NOT NULL,
  `secret` VARCHAR(255) NOT NULL,
  `events` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `revoked_at` DATETIME(3) NULL,
  INDEX `integration_webhooks_org_id_revoked_at_idx`(`org_id`, `revoked_at`),
  INDEX `integration_webhooks_key_id_idx`(`key_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `integration_webhooks`
  ADD CONSTRAINT `integration_webhooks_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `integration_webhooks`
  ADD CONSTRAINT `integration_webhooks_key_id_fkey` FOREIGN KEY (`key_id`) REFERENCES `integration_api_keys`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `integration_webhook_deliveries` (
  `id` CHAR(36) NOT NULL,
  `webhook_id` CHAR(36) NOT NULL,
  `event_id` VARCHAR(64) NOT NULL,
  `event_type` VARCHAR(64) NOT NULL,
  `payload` JSON NOT NULL,
  `status` VARCHAR(20) NOT NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `last_error` VARCHAR(500) NULL,
  `next_attempt_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `delivered_at` DATETIME(3) NULL,
  UNIQUE INDEX `integration_webhook_deliveries_webhook_id_event_id_key`(`webhook_id`, `event_id`),
  INDEX `integration_webhook_deliveries_status_next_attempt_at_idx`(`status`, `next_attempt_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `integration_webhook_deliveries`
  ADD CONSTRAINT `integration_webhook_deliveries_webhook_id_fkey` FOREIGN KEY (`webhook_id`) REFERENCES `integration_webhooks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
