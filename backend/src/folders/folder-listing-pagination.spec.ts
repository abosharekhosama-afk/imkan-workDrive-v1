import { applyListingPage } from './folder-listing-pagination';

describe('folder listing pagination', () => {
  const folders = [{ id: 'f1' }, { id: 'f2' }];
  const files = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('returns everything when no page query is provided', () => {
    const page = applyListingPage(folders, files, {});
    expect(page.folders).toHaveLength(2);
    expect(page.files).toHaveLength(3);
    expect(page.next_cursor).toBeNull();
    expect(page.has_more).toBe(false);
  });

  it('pages with limit, cursor and offset', () => {
    const first = applyListingPage(folders, files, { limit: 2 });
    expect(first.folders.map((f) => f.id)).toEqual(['f1', 'f2']);
    expect(first.files).toEqual([]);
    expect(first.next_cursor).toBe('folder:f2');
    expect(first.has_more).toBe(true);

    const second = applyListingPage(folders, files, {
      cursor: first.next_cursor!,
      limit: 2,
    });
    expect(second.folders).toEqual([]);
    expect(second.files.map((f) => f.id)).toEqual(['a', 'b']);
    expect(second.next_cursor).toBe('file:b');

    const last = applyListingPage(folders, files, {
      cursor: second.next_cursor!,
      limit: 2,
    });
    expect(last.files.map((f) => f.id)).toEqual(['c']);
    expect(last.has_more).toBe(false);
    expect(last.next_cursor).toBeNull();

    const off = applyListingPage(folders, files, { offset: 2, limit: 2 });
    expect(off.files.map((f) => f.id)).toEqual(['a', 'b']);
  });
});
