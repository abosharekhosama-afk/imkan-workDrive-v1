import test from 'node:test';
import assert from 'node:assert/strict';
import {
  duplicateColumnsForSheet,
  hiddenTableRowsForSheet,
  textOverwriteCountForSheet,
  textSplitPreviewForSheet,
} from './sheet-page-derived-logic.ts';
import { defaultWorkbook } from './model.ts';

test('sheet page derived state is safe before workbook hydration', () => {
  assert.deepEqual(duplicateColumnsForSheet(undefined, 'A1', 'B2'), []);
  assert.deepEqual(textSplitPreviewForSheet(undefined, 'A1'), []);
  assert.equal(textOverwriteCountForSheet(undefined, 'A1'), 0);
  assert.equal(hiddenTableRowsForSheet(undefined, null).size, 0);
});

test('sheet page derived state works after workbook hydration', () => {
  const doc = defaultWorkbook();
  const sheet = doc.sheets[0];
  sheet.cells.A1 = { value: 'a,b,c' };
  assert.ok(duplicateColumnsForSheet(sheet, 'A1', 'B1').length >= 2);
  assert.ok(textSplitPreviewForSheet(sheet, 'A1').length > 0);
  assert.equal(textOverwriteCountForSheet(sheet, 'A1'), 0);
  assert.equal(hiddenTableRowsForSheet(sheet, doc).size, 0);
});
