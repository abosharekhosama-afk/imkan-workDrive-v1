ALTER TABLE `users`
  ADD COLUMN `theme_mode` VARCHAR(32) NOT NULL DEFAULT 'light',
  ADD COLUMN `theme_color` VARCHAR(32) NOT NULL DEFAULT 'blue',
  ADD COLUMN `font_family` VARCHAR(64) NOT NULL DEFAULT 'Zoho Puvi',
  ADD COLUMN `lighter_sidebar` BOOLEAN NOT NULL DEFAULT false;
