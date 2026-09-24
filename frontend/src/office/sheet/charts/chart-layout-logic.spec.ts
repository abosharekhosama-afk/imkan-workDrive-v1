import test from 'node:test';
import assert from 'node:assert/strict';
import { applyResize, chartLayout, chartLayoutPatch, clampChartHeight, clampChartWidth } from './chart-layout-logic.ts';
import { defaultWorkbook } from '../model.ts';

const sheet = defaultWorkbook().sheets[0];
const chart = { id: 'c1', type: 'column' as const, title: 'T', rangeStart: 'A1', rangeEnd: 'B3', position: { row: 1, col: 1 }, width: 320, height: 240, legend: true, showLabels: false };
test('chart layout clamps dimensions', () => {
  assert.equal(clampChartWidth(50), 200);
  assert.equal(clampChartHeight(50), 150);
  const layout = chartLayout(sheet, chart);
  assert.ok(layout.width >= 200);
});
test('chart resize commits anchor patch', () => {
  const resized = applyResize(chartLayout(sheet, chart), 'se', 40, 30);
  const patch = chartLayoutPatch(resized, sheet, 99, 25);
  assert.equal(patch.width, resized.width);
  assert.ok(typeof patch.position.row === 'number');
});
