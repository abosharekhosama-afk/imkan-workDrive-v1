import { describe, expect, it } from 'vitest';
import { addComment, addCommentReply, resolveComment, deleteComment } from './commands';
import { defaultShow } from './model';

describe('IMKAN Show Phase 17 collaboration', () => {
  it('creates a slide/element anchored comment', () => {
    const d = addComment(defaultShow(), 'Review title', 'title', 'user-1');
    expect(d.comments).toHaveLength(1);
    expect(d.comments?.[0]).toMatchObject({ text: 'Review title', elementId: 'title', authorId: 'user-1', resolved: false });
  });
  it('supports replies and resolve/reopen', () => {
    let d = addComment(defaultShow(), 'Needs revision');
    const id = d.comments![0].id;
    d = addCommentReply(d, id, 'Updated', 'user-2');
    d = resolveComment(d, id, true);
    expect(d.comments![0].replies).toHaveLength(1);
    expect(d.comments![0].resolved).toBe(true);
    d = resolveComment(d, id, false);
    expect(d.comments![0].resolved).toBe(false);
  });
  it('deletes a comment without changing slide content', () => {
    const base = defaultShow();
    let d = addComment(base, 'Temporary');
    d = deleteComment(d, d.comments![0].id);
    expect(d.comments).toHaveLength(0);
    expect(d.slides[0].elements).toHaveLength(base.slides[0].elements.length);
  });
});
