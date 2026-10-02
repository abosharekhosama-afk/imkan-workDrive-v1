import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'src/components/writer-zoho-chrome.tsx');
const source = fs.readFileSync(file, 'utf8');

test('WriterChrome has no explicit noop action', () => {
  assert.equal(/const\s+noop\s*=/.test(source), false);
});

test('critical chrome controls expose real action props', () => {
  for (const prop of ['onRename', 'onFormatPainter', 'onCollaborators', 'onNotifications', 'onSettings', 'onInfo']) {
    assert.match(source, new RegExp(prop));
  }
});

test('disabled toolbar controls are explicit instead of silently clickable', () => {
  assert.match(source, /icon="checklist" title="Checklist" disabled/);
});
