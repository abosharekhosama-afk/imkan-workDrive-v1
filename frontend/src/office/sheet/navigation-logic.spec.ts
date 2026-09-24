import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { navigateSelection } from './navigation-logic.ts';

describe('navigation-logic', () => {
  it('home moves to first column in row', () => {
    assert.equal(navigateSelection('C5', 'home', 99, 25), 'A5');
  });

  it('ctrl-home moves to A1', () => {
    assert.equal(navigateSelection('C5', 'ctrl-home', 99, 25), 'A1');
  });

  it('ctrl-end moves to bottom-right', () => {
    assert.equal(navigateSelection('C5', 'ctrl-end', 99, 25), 'Z100');
  });

  it('page-down moves by page size', () => {
    assert.equal(navigateSelection('B3', 'page-down', 99, 25, 10), 'B13');
  });
});
