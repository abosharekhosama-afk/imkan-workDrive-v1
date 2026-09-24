import test from 'node:test';
import assert from 'node:assert/strict';
import { validateNamedRangeName, validateNamedRangeReference, resolveNamedRange } from './named-range-logic.ts';
import { defaultWorkbook } from '../model.ts';

test('named range validation rejects duplicates and invalid references', () => {
  const existing = [{ name: 'Sales', reference: 'A1:B2' }];
  assert.equal(validateNamedRangeName('Sales', existing), 'A named range with this name already exists');
  assert.equal(validateNamedRangeName('1bad', existing), 'Name must start with a letter and contain only letters, numbers, or _');
  assert.equal(validateNamedRangeReference('NOT_A_RANGE'), 'Invalid range reference');
});

test('resolveNamedRange finds scoped workbook entry', () => {
  const w = defaultWorkbook();
  w.namedRanges = [{ name: 'Total', reference: 'A1', scopeSheetId: w.activeSheet }];
  assert.equal(resolveNamedRange(w, 'Total')?.reference, 'A1');
});
