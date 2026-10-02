import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pageSource = readFileSync(join(process.cwd(), 'src/app/office/writer/[fileId]/page.tsx'), 'utf8');

test('Writer advanced actions no longer use browser prompt/confirm', () => {
  assert.equal(/window\.prompt\s*\(/.test(pageSource), false);
  assert.equal(/window\.confirm\s*\(/.test(pageSource), false);
  assert.equal(/openAdvancedDialog\(/.test(pageSource), true);
});

test('Writer advanced dialog exposes the migrated action families', () => {
  for (const key of ['footnote','endnote','equation','symbol','citation','caption','crossref','index','table']) {
    assert.equal(pageSource.includes(`'${key}'`), true, `missing ${key} dialog mode`);
  }
});
