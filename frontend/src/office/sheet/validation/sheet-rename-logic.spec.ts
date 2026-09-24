import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSheetRename } from './sheet-rename-logic.ts';
import { defaultWorkbook } from '../model.ts';

test('sheet rename validation blocks empty, duplicate, and invalid names', () => {
  const w = defaultWorkbook();
  w.sheets.push({ id: 'sheet-2', name: 'Summary', cells: {} });
  assert.equal(validateSheetRename(w, 'sheet-1', ''), 'Sheet name cannot be empty');
  assert.equal(validateSheetRename(w, 'sheet-1', 'Summary'), 'A sheet with this name already exists');
  assert.equal(validateSheetRename(w, 'sheet-1', 'Bad/Name'), 'Sheet name contains invalid characters');
  assert.equal(validateSheetRename(w, 'sheet-1', 'Q4 Plan'), null);
});
