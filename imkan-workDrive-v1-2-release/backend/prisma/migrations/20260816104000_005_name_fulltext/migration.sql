-- CreateIndex
CREATE FULLTEXT INDEX `folders_name_fulltext` ON `folders`(`name`);

-- CreateIndex
CREATE FULLTEXT INDEX `files_name_fulltext` ON `files`(`name`);
