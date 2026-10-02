import test from 'node:test';
import assert from 'node:assert/strict';
import { getOfficeDirection, getLogicalMenuPlacement, officeTokens } from '../../components/office-tokens.ts';

test('Arabic Office chrome uses RTL direction', () => {
  assert.equal(getOfficeDirection(true), 'rtl');
  assert.equal(getOfficeDirection(false), 'ltr');
});

test('menu placement mirrors between LTR and RTL', () => {
  assert.deepEqual(getLogicalMenuPlacement(false, 204), { left: '204px', minWidth: '320px' });
  assert.deepEqual(getLogicalMenuPlacement(true, 204), { right: '204px', minWidth: '320px' });
});

test('shared office tokens expose stable chrome dimensions', () => {
  assert.equal(officeTokens.controlHeight, 34);
  assert.equal(officeTokens.toolbarButton, 35);
  assert.equal(officeTokens.primary, '#286ce5');
});
