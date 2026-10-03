import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAutocorrect, replacePlainRange, splitTextToTable, transliterateText } from './editor-actions.ts';

test('transliterate converts Arabic letters and Latin syllables', () => {
  assert.equal(transliterateText('كتب'), 'ktb');
  assert.equal(transliterateText('shams'), 'شامس');
});

test('splitTextToTable keeps rows and pads short lines', () => {
  assert.deepEqual(splitTextToTable('a\tb\nc'), [['a', 'b'], ['c', '']]);
  assert.deepEqual(splitTextToTable('only'), [['only']]);
});

test('applyAutocorrect replaces known words and keeps the rest', () => {
  assert.equal(applyAutocorrect('teh recieve note', { note: 'notice' }), 'the receive notice');
});

test('replacePlainRange swaps only the selected span', () => {
  assert.equal(replacePlainRange('hello world', 6, 11, 'writer'), 'hello writer');
});