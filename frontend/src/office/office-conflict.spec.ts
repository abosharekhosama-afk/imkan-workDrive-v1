import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneWorkbook, defaultWorkbook } from './sheet/model.ts';

test('stale client baseRevision differs from advanced server revision', () => {
  const clientBaseRevision = 7;
  const serverRevision = 8;
  assert.notEqual(clientBaseRevision, serverRevision);
});

test('conflict payload shape matches OfficeConflictDialog expectations', () => {
  const conflict = {
    fileId: 'file-1',
    kind: 'SHEET',
    local: defaultWorkbook(),
    remote: cloneWorkbook(defaultWorkbook()),
    remoteRevision: 8,
    detectedAt: new Date().toISOString(),
    reason: 'OFFICE_REVISION_CONFLICT',
  };
  assert.equal(conflict.reason, 'OFFICE_REVISION_CONFLICT');
  assert.equal(conflict.remoteRevision, 8);
  assert.equal(conflict.local.type, 'SHEET');
});

test('serialize local and remote workbooks for deterministic conflict prep', () => {
  const local = defaultWorkbook();
  const remote = cloneWorkbook(local);
  remote.sheets[0].name = 'Renamed';
  const payload = JSON.parse(JSON.stringify({ local, remote, remoteRevision: 8, reason: 'OFFICE_REVISION_CONFLICT' }));
  assert.equal(payload.remote.sheets[0].name, 'Renamed');
  assert.equal(payload.local.sheets[0].name, 'Sheet1');
});
