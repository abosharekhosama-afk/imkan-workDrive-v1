import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Admin Console settings repair', () => {
  it('keeps the settings table self-healing for older databases', () => {
    const source = readFileSync(join(__dirname, 'enterprise.service.ts'), 'utf8');
    assert.match(source, /CREATE TABLE IF NOT EXISTS admin_console_settings/);
    assert.match(source, /INSERT INTO admin_console_settings/);
    assert.match(source, /ON DUPLICATE KEY UPDATE org_id=VALUES\(org_id\)/);
  });
});
