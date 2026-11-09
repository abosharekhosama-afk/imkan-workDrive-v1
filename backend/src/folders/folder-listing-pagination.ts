export type ListingPageQuery = {
  cursor?: string;
  limit?: string | number;
  offset?: string | number;
};

export function applyListingPage<
  T extends { id: string },
  U extends { id: string },
>(folders: T[], files: U[], query: ListingPageQuery = {}) {
  const items: Array<{ kind: 'folder' | 'file'; id: string; value: T | U }> = [
    ...folders.map((value) => ({
      kind: 'folder' as const,
      id: value.id,
      value,
    })),
    ...files.map((value) => ({ kind: 'file' as const, id: value.id, value })),
  ];
  if (query.cursor == null && query.limit == null && query.offset == null) {
    return {
      folders,
      files,
      next_cursor: null as string | null,
      nextCursor: null as string | null,
      has_more: false,
    };
  }
  const limitRaw = Number(query.limit);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(500, Math.floor(limitRaw))
      : 100;
  let start = 0;
  if (query.cursor) {
    const [kind, ...rest] = String(query.cursor).split(':');
    const id = rest.join(':');
    const idx = items.findIndex(
      (item) =>
        item.kind === (kind === 'file' ? 'file' : 'folder') && item.id === id,
    );
    start = idx >= 0 ? idx + 1 : 0;
  } else if (query.offset != null && query.offset !== '') {
    const off = Number(query.offset);
    start = Number.isFinite(off) && off > 0 ? Math.floor(off) : 0;
  }
  const slice = items.slice(start, start + limit);
  const last = slice[slice.length - 1];
  const hasMore = start + slice.length < items.length;
  const next = hasMore && last ? `${last.kind}:${last.id}` : null;
  return {
    folders: slice.filter((i) => i.kind === 'folder').map((i) => i.value as T),
    files: slice.filter((i) => i.kind === 'file').map((i) => i.value as U),
    next_cursor: next,
    nextCursor: next,
    has_more: hasMore,
  };
}
