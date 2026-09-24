import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { autoFitColumnWidth, clampColumnWidth, estimateTextWidth } from './dimension-logic.ts';

describe('dimension-logic', () => {
  it('clamps column width', () => {
    assert.equal(clampColumnWidth(20), 60);
    assert.equal(clampColumnWidth(999), 420);
  });
  it('estimates text width', () => {
    assert.ok(estimateTextWidth('Hello') > 30);
  });
  it('auto-fits column from cell content', () => {
    const sheet = { id: 's', name: 'S', cells: { A1: { value: 'Long header value here' } } };
    const w = autoFitColumnWidth(sheet as any, 0, { schema: 7, type: 'SHEET', title: '', activeSheet: 's', sheets: [sheet as any] } as any, 10);
    assert.ok(w >= 60);
  });
});
