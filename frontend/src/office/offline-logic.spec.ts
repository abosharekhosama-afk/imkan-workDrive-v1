import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeIdOrder, planOfficeRebase, rebasePathsOverlap } from './office-rebase-logic.ts';

test('block content does not overlap document order', () => {
  assert.equal(rebasePathsOverlap('/blocksById/a', '/blockOrder'), false);
  assert.equal(rebasePathsOverlap('/sheetsById/s/cells/A1', '/sheetOrder'), false);
});

test('order merge keeps local sequence and appends remote-only items', () => {
  assert.deepEqual(mergeIdOrder(['a', 'b', 'remote'], ['b', 'a', 'local']), ['b', 'a', 'local', 'remote']);
});

test('safe rebase holds an overlapping cell and merges sheet order', () => {
  const remote = { sheets: [{ id: 's1' }, { id: 's2' }] };
  const planned = planOfficeRebase(
    [
      { op: 'set', path: '/sheetsById/s1/cells/A1', value: 'local' },
      { op: 'set', path: '/sheetsById/s1/cells/B1', value: 'note' },
      { op: 'set', path: '/sheetOrder', value: ['s1'] },
    ],
    [{ op: 'set', path: '/sheetsById/s1/cells/A1', value: 'remote' }],
    remote,
    'safe',
  );
  assert.deepEqual(planned.pending.map((patch) => patch.path), ['/sheetsById/s1/cells/A1']);
  assert.deepEqual(planned.safe.map((patch) => patch.path), ['/sheetsById/s1/cells/B1', '/sheetOrder']);
  assert.deepEqual(planned.safe[1]?.value, ['s1', 's2']);
});

test('adopt rebase keeps the overlapping local edit', () => {
  const planned = planOfficeRebase(
    [{ op: 'set', path: '/blocksById/p1', value: { id: 'p1', text: 'mine' } }],
    [{ op: 'set', path: '/blocksById/p1', value: { id: 'p1', text: 'theirs' } }],
    { blocks: [{ id: 'p1' }, { id: 'p2' }] },
    'adopt',
  );
  assert.equal(planned.pending.length, 0);
  assert.equal(planned.safe.length, 1);
  assert.equal((planned.safe[0]?.value as { text: string }).text, 'mine');
});