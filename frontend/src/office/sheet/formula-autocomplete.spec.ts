import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyAutocompleteInsert, buildAutocompleteInsert, formulaAutocompleteSuggestions } from './formula-autocomplete.ts';

describe('formula-autocomplete', () => {
  it('suggests SUM for =SU', () => {
    const { matches } = formulaAutocompleteSuggestions('=SU');
    assert.ok(matches.some((m) => m.name === 'SUM'));
  });
  it('inserts function token', () => {
    const built = buildAutocompleteInsert('=SU', 3, 'SUM');
    assert.equal(applyAutocompleteInsert('=SU', built), '=SUM(');
  });
});
