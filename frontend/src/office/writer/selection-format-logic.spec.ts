import test from 'node:test';
import assert from 'node:assert/strict';
import { patchRunsInRange, rangeHasFormat } from './selection-format.ts';

test('Writer selection formatting patches only the selected text', () => {
  const runs = [{ text: 'Hello world' }];
  const next = patchRunsInRange(runs, 6, 11, { bold: true });
  assert.deepEqual(next, [
    { text: 'Hello ' },
    { text: 'world', bold: true },
  ]);
});

test('Writer selection formatting can span multiple runs', () => {
  const runs = [
    { text: 'Hello ', bold: true },
    { text: 'beautiful' },
    { text: ' world', italic: true },
  ];
  const next = patchRunsInRange(runs, 3, 14, { underline: true });
  assert.deepEqual(next, [
    { text: 'Hel', bold: true },
    { text: 'lo ', bold: true, underline: true },
    { text: 'beautifu', underline: true },
    { text: 'l' },
    { text: ' world', italic: true },
  ]);
});

test('Writer selection formatting leaves a collapsed selection unchanged', () => {
  const runs = [{ text: 'Hello' }];
  assert.deepEqual(patchRunsInRange(runs, 2, 2, { italic: true }), runs);
});

test('Writer formatting toggles off only when the whole selected range already has the mark', () => {
  const runs=[{text:'Hello',bold:true},{text:' world'}];
  assert.equal(rangeHasFormat(runs,0,5,'bold'),true);
  assert.equal(rangeHasFormat(runs,0,11,'bold'),false);
});

test('Writer font family patches only the selected range', () => {
  const runs = [{ text: 'Hello world' }];
  assert.deepEqual(patchRunsInRange(runs, 6, 11, { fontFamily: 'Arial' }), [
    { text: 'Hello ' },
    { text: 'world', fontFamily: 'Arial' },
  ]);
});

test('Writer font size splits an existing formatted run without losing prior marks', () => {
  const runs = [{ text: 'abcdef', bold: true }];
  assert.deepEqual(patchRunsInRange(runs, 2, 4, { fontSize: 18 }), [
    { text: 'ab', bold: true },
    { text: 'cd', bold: true, fontSize: 18 },
    { text: 'ef', bold: true },
  ]);
});

test('Writer clear formatting affects only the selected range', () => {
  const runs = [
    { text: 'one', bold: true, color: '#f00' },
    { text: 'two', italic: true, fontSize: 24 },
  ];
  assert.deepEqual(patchRunsInRange(runs, 1, 4, {
    bold: false, italic: false, underline: false, strike: false,
    fontFamily: undefined, fontSize: undefined, color: undefined,
    highlight: undefined, verticalAlign: 'baseline',
  }), [
    { text: 'o', bold: true, color: '#f00' },
    { text: 'net', bold: false, italic: false, underline: false, strike: false, fontFamily: undefined, fontSize: undefined, color: undefined, highlight: undefined, verticalAlign: 'baseline' },
    { text: 'wo', italic: true, fontSize: 24 },
  ]);
});
