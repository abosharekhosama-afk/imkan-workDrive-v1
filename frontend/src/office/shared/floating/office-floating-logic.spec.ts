import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeFloatingPosition, isOutsideFloatingLayer } from './office-floating-logic.ts';

const viewport = { width: 800, height: 600, scrollX: 0, scrollY: 0 };

describe('computeFloatingPosition', () => {
  it('places below anchor by default', () => {
    const anchor = { top: 100, left: 50, right: 150, bottom: 120, width: 100, height: 20 };
    const floating = { width: 180, height: 120 };
    const rect = computeFloatingPosition(anchor, floating, 'bottom-start', 4, viewport);
    assert.equal(rect.top, 124);
    assert.equal(rect.left, 50);
  });

  it('flips to top when bottom does not fit', () => {
    const anchor = { top: 520, left: 50, right: 150, bottom: 540, width: 100, height: 20 };
    const floating = { width: 180, height: 120 };
    const rect = computeFloatingPosition(anchor, floating, 'bottom-start', 4, viewport);
    assert.equal(rect.top, 396);
    assert.equal(rect.left, 50);
  });

  it('flips to left when right does not fit', () => {
    const anchor = { top: 100, left: 720, right: 780, bottom: 120, width: 60, height: 20 };
    const floating = { width: 160, height: 80 };
    const rect = computeFloatingPosition(anchor, floating, 'right-start', 4, viewport);
    assert.equal(rect.left, 556);
    assert.equal(rect.top, 100);
  });

  it('clamps within viewport padding', () => {
    const anchor = { top: 10, left: 2, right: 42, bottom: 30, width: 40, height: 20 };
    const floating = { width: 200, height: 100 };
    const rect = computeFloatingPosition(anchor, floating, 'bottom-start', 4, viewport);
    assert.ok(rect.left >= 8);
    assert.ok(rect.top >= 8);
  });
});

describe('isOutsideFloatingLayer', () => {
  it('returns false for clicks inside layer or anchor', { skip: typeof document === 'undefined' }, () => {
    const layer = document.createElement('div');
    const inner = document.createElement('button');
    layer.appendChild(inner);
    const anchor = document.createElement('button');
    assert.equal(isOutsideFloatingLayer(inner, layer, anchor), false);
    assert.equal(isOutsideFloatingLayer(anchor, layer, anchor), false);
  });

  it('returns true for outside clicks', { skip: typeof document === 'undefined' }, () => {
    const layer = document.createElement('div');
    const outside = document.createElement('div');
    assert.equal(isOutsideFloatingLayer(outside, layer, null), true);
  });

  it('treats non-node targets as outside', () => {
    assert.equal(isOutsideFloatingLayer(null, null, null), true);
  });
});
