import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getSheetFunction, searchSheetFunctions, isSupportedFunctionName } from './function-registry.ts';
import { evalFormula } from './model.ts';

describe('function-registry', () => {
  it('finds supported SUM function', () => {
    assert.equal(getSheetFunction('sum')?.name, 'SUM');
    assert.equal(isSupportedFunctionName('IF'), true);
    assert.equal(isSupportedFunctionName('ACOS'), false);
  });
  it('filters by query and category', () => {
    const hits = searchSheetFunctions('sum', 'Statistical');
    assert.ok(hits.some((f) => f.name === 'SUM'));
  });
});

describe('function evaluation', () => {
  it('evaluates SUM through existing engine', () => {
    const sheet = { id: 's', name: 'S', cells: { A1: { value: 10 }, A2: { value: 20 } } };
    const result = evalFormula('=SUM(A1:A2)', sheet as any);
    assert.equal(result, 30);
  });
  it('returns NAME error for unknown function', () => {
    const sheet = { id: 's', name: 'S', cells: {} };
    assert.throws(() => evalFormula('=ACOS(1)', sheet as any), /function/);
  });
});
