import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cloudFilesFromListing } from './cloud-import-listing-logic.ts';

describe('cloudFilesFromListing', () => {
  it('reads the files array from a listing payload', () => {
    const file = { id: 'f1', name: 'a.docx', size: 12, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
    const rows = cloudFilesFromListing({ files: [file], nextPageToken: null, parent: null });
    assert.deepEqual(rows, [file]);
  });

  it('accepts an already-unwrapped file array', () => {
    const file = { id: 'f2', name: 'b.xlsx', size: null, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    assert.deepEqual(cloudFilesFromListing([file]), [file]);
  });

  it('returns an empty array for a missing listing', () => {
    assert.deepEqual(cloudFilesFromListing(null), []);
    assert.deepEqual(cloudFilesFromListing(undefined), []);
  });
});