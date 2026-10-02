import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('Writer history + selection', async (t) => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
  const page = fs.readFileSync(path.join(root, 'app/office/writer/[fileId]/page.tsx'), 'utf8');
  const helper = fs.readFileSync(path.join(root, 'office/writer/history-selection.ts'), 'utf8');

  await t.test('captures a selection bookmark before commit and restores it after commit', () => {
    assert.ok(page.includes('const bookmark=captureWriterSelection()'));
    assert.ok(page.includes('restoreWriterSelection(bookmark)'));
  });

  await t.test('stores selection alongside undo history', () => {
    assert.ok(page.includes('historySelections'));
    assert.ok(page.includes('previousSelection=historySelections[historySelections.length-1]'));
    assert.ok(page.includes('restoreWriterSelection(previousSelection)'));
  });

  await t.test('stores selection alongside redo history', () => {
    assert.ok(page.includes('futureSelections'));
    assert.ok(page.includes('nextSelection=futureSelections[0]'));
    assert.ok(page.includes('restoreWriterSelection(nextSelection)'));
  });

  await t.test('uses block-relative character offsets so selection survives DOM rerendering', () => {
    assert.ok(helper.includes('start: textOffset(block, range.startContainer, range.startOffset)'));
    assert.ok(helper.includes('end: textOffset(block, range.endContainer, range.endOffset)'));
    assert.ok(helper.includes('pointAtOffset(block, bookmark.start)'));
    assert.ok(helper.includes('pointAtOffset(block, bookmark.end)'));
  });
});
