ALTER TABLE `folders`
  ADD COLUMN `mandate_data_template_id` CHAR(36) NULL,
  ADD COLUMN `mandate_data_template_target` VARCHAR(10) NOT NULL DEFAULT 'BOTH';

ALTER TABLE `folders`
  ADD CONSTRAINT `folders_mandate_data_template_id_fkey`
  FOREIGN KEY (`mandate_data_template_id`) REFERENCES `file_data_templates`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `folders_mandate_data_template_id_idx` ON `folders`(`mandate_data_template_id`);
