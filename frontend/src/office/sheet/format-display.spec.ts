import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formulaErrorCode } from './formula-errors.ts';
import { formatCellValue } from './format-display.ts';

describe('formula-errors', () => {
  it('maps unknown function to NAME error', () => {
    assert.equal(formulaErrorCode(new Error('function')), '#NAME?');
  });
});

describe('format-display', () => {
  it('formats currency values', () => {
    assert.equal(formatCellValue(12.5, { numberFormat: 'currency', decimals: 2 }), '$12.50');
  });
  it('formats percent values', () => {
    assert.equal(formatCellValue(0.25, { numberFormat: 'percent', decimals: 0 }), '25%');
  });
});
