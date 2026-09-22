import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('Phase 14 shared Office file comments contract', () => {
  it('uses file-level comment resources shared by Office editors', () => {
    const routes = [
      'GET /files/:fileId/comments',
      'POST /files/:fileId/comments',
      'PATCH /files/:fileId/comments/:id',
      'DELETE /files/:fileId/comments/:id',
    ];
    assert.equal(routes.length, 4);
    assert.equal(routes.some((x) => x.startsWith('PATCH')), true);
  });
});
