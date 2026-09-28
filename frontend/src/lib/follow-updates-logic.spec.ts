import assert from 'node:assert/strict';
import test from 'node:test';
import { followUpdatesMenuLabel, followUpdatesToastMessage } from './follow-updates-logic';

test('followUpdatesMenuLabel switches between follow and unfollow keys', () => {
  assert.equal(followUpdatesMenuLabel(false), 'menu.followUpdates');
  assert.equal(followUpdatesMenuLabel(true), 'menu.unfollowUpdates');
});

test('followUpdatesToastMessage switches between started and stopped keys', () => {
  assert.equal(followUpdatesToastMessage(true, 'Report.pdf'), 'follow.started');
  assert.equal(followUpdatesToastMessage(false, 'Report.pdf'), 'follow.stopped');
});
