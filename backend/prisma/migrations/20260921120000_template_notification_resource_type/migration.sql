-- Allow Office notifications to reference template resources.
ALTER TABLE `notifications`
  MODIFY `resource_type` ENUM('FILE', 'FOLDER', 'TEMPLATE') NULL;
