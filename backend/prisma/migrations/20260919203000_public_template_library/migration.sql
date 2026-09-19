-- Zoho parity: Public Template Library is global, read-only, and has no categories.
UPDATE template_libraries
SET org_id = NULL, owner_id = NULL
WHERE type = 'PUBLIC';

UPDATE templates t
JOIN template_libraries l ON l.id = t.library_id
SET t.org_id = NULL, t.owner_id = NULL, t.category_id = NULL
WHERE l.type = 'PUBLIC';

DELETE c FROM template_categories c
JOIN template_libraries l ON l.id = c.library_id
WHERE l.type = 'PUBLIC';

