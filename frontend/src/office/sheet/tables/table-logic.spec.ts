import test from 'node:test';
import assert from 'node:assert/strict';
import { findTableAtCell, validateTableName } from './table-logic.ts';
import { defaultWorkbook } from '../model.ts';

test('findTableAtCell detects membership', () => {
  const sheet = defaultWorkbook().sheets[0];
  sheet.tables = [{ id: 't1', name: 'T', start: 'A1', end: 'C3', hasHeader: true }];
  assert.equal(findTableAtCell(sheet, 'B2')?.id, 't1');
  assert.equal(validateTableName(sheet, 'T', 'other'), 'A table with this name already exists');
});
