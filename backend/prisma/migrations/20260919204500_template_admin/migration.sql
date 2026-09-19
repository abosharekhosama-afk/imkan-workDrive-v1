ALTER TABLE organization_memberships
  ADD COLUMN is_template_admin BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE organization_memberships
SET is_template_admin = TRUE
WHERE role IN ('ADMIN', 'SUPER_ADMIN');
