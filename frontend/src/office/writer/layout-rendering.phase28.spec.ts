import test from 'node:test';
import assert from 'node:assert/strict';
import { imageWrapStyle, sectionColumnStyle, tableBreakStyle } from './layout-rendering.ts';

test('section columns are clamped and use physical gap', () => {
  assert.deepEqual(sectionColumnStyle({columns: 3, columnGapMm: 14}), {columnCount:3,columnGap:'14mm',columnFill:'auto'});
  assert.equal(sectionColumnStyle({columns: 99, columnGapMm: 999}).columnCount, 4);
  assert.equal(sectionColumnStyle({columns: 0, columnGapMm: 0}).columnGap, '4mm');
});

test('image square wrap floats inline-start and other modes stay deterministic', () => {
  assert.equal(imageWrapStyle('square', 'rtl').float, 'inline-start');
  assert.equal(imageWrapStyle('behind').position, 'absolute');
  assert.equal(imageWrapStyle('front').zIndex, 10);
  assert.equal(imageWrapStyle(undefined).display, 'block');
});

test('table row-break policy maps to print-safe CSS', () => {
  assert.deepEqual(tableBreakStyle(false), {breakInside:'avoid', pageBreakInside:'avoid'});
  assert.deepEqual(tableBreakStyle(true), {breakInside:'auto', pageBreakInside:'auto'});
});
