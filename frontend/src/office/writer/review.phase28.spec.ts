import { acceptAllChanges, acceptChange, rejectAllChanges, rejectChange, recordChange } from './review';
import type { WriterDocument } from './model';

const base = (): WriterDocument => ({
  schema: 7,
  type: 'WRITER',
  title: 'Review test',
  blocks: [{ id: 'b1', type: 'paragraph', align: 'start', runs: [{ text: 'Original' }] }],
  language: 'en',
  review: { comments: [], changes: [], snapshots: [], trackChanges: true },
  citations: [], citationSources: [],
  bookmarks: [],
  footnotes: [],
  endnotes: [],
  crossReferences: [],
  indexEntries: [],
  sections: [],
  page: { widthMm: 210, heightMm: 297, marginTopMm: 20, marginRightMm: 20, marginBottomMm: 20, marginLeftMm: 20 },
} as WriterDocument);

describe('Phase 28 Writer review state transitions', () => {
  it('accepts a pending insertion by materializing the after state', () => {
    const changed = recordChange(base(), 'b1', [{ text: 'Original' }], [{ text: 'Original + added' }], 'insert');
    const id = changed.review.changes[0].id;
    const accepted = acceptChange(changed, id);
    expect(accepted.blocks[0].runs[0].text).toBe('Original + added');
    expect(accepted.review.changes[0].status).toBe('accepted');
  });

  it('rejects a pending insertion by restoring the before state', () => {
    const changed = recordChange(base(), 'b1', [{ text: 'Original' }], [{ text: 'Original + added' }], 'insert');
    const id = changed.review.changes[0].id;
    const rejected = rejectChange(changed, id);
    expect(rejected.blocks[0].runs[0].text).toBe('Original');
    expect(rejected.review.changes[0].status).toBe('rejected');
  });

  it('accepts and rejects all pending changes without altering resolved changes', () => {
    let doc = base();
    doc = recordChange(doc, 'b1', [{ text: 'Original' }], [{ text: 'Accepted' }], 'insert');
    const acceptedId = doc.review.changes[0].id;
    doc = acceptChange(doc, acceptedId);
    doc = recordChange(doc, 'b1', [{ text: 'Accepted' }], [{ text: 'Rejected' }], 'insert');
    const accepted = doc;
    expect(accepted.review.changes.find(c => c.id === acceptedId)?.status).toBe('accepted');
    const rejected = rejectAllChanges(accepted);
    expect(rejected.review.changes.every(c => c.status !== 'pending')).toBe(true);
    expect(rejected.blocks[0].runs[0].text).toBe('Accepted');
  });

  it('acceptAllChanges materializes every pending after state', () => {
    let doc = base();
    doc = recordChange(doc, 'b1', [{ text: 'Original' }], [{ text: 'Final' }], 'insert');
    const accepted = acceptAllChanges(doc);
    expect(accepted.blocks[0].runs[0].text).toBe('Final');
    expect(accepted.review.changes[0].status).toBe('accepted');
  });
});
