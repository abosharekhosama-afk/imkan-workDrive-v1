import test from 'node:test';
import assert from 'node:assert/strict';
import { activeSheet, cloneWorkbook, defaultWorkbook } from '../sheet/model.ts';

test('sheet workbook roundtrip preserves phase 4 features', () => {
  const w = defaultWorkbook();
  const sheet = activeSheet(w)!;
  sheet.name = 'Quarterly';
  sheet.frozenRows = 1;
  sheet.frozenColumns = 1;
  sheet.cells.A1 = { value: 'Revenue', format: { bold: true }, note: 'Header note' };
  sheet.cells.A2 = { value: 100, validation: { type: 'list', values: ['100', '200'] } };
  sheet.conditionalFormats = [{ id: 'cf1', range: 'A1:A5', type: 'cellIs', operator: '>', value: '0', format: { background: '#fef3c7' } }];
  sheet.tables = [{ id: 't1', name: 'Sales', start: 'A1', end: 'B3', hasHeader: true, filter: { Revenue: '100' } }];
  sheet.pivotTables = [{ id: 'p1', name: 'Pivot1', sourceRange: 'A1:B3', destinationRange: 'E1', aggregation: 'sum' }];
  sheet.charts = [{ id: 'c1', type: 'column', title: 'Chart', rangeStart: 'A1', rangeEnd: 'B3', position: { row: 0, col: 4 }, width: 320, height: 200, legend: true, showLabels: true, x: 12, y: 8 }];
  w.namedRanges = [{ name: 'Header', reference: 'A1', scopeSheetId: sheet.id }];

  const restored = cloneWorkbook(JSON.parse(JSON.stringify(w)));
  const rs = activeSheet(restored)!;
  assert.equal(rs.name, 'Quarterly');
  assert.equal(rs.frozenRows, 1);
  assert.equal(rs.cells.A1.note, 'Header note');
  assert.equal(rs.cells.A2.validation?.values?.[0], '100');
  assert.equal(restored.namedRanges?.[0].name, 'Header');
  assert.equal(rs.tables?.[0].filter?.Revenue, '100');
  assert.equal(rs.pivotTables?.[0].destinationRange, 'E1');
  assert.equal(rs.charts?.[0].x, 12);
});
