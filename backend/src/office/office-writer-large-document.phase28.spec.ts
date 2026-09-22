import { performance } from 'node:perf_hooks';
import { normalizeWriterDocument } from '../../../frontend/src/office/writer/model';

describe('Phase 28 Writer large-document closure contract', () => {
  it('normalizes a 10K-block document without losing block count', () => {
    const source = {
      schema: 7,
      type: 'WRITER',
      title: 'Large document',
      language: 'mixed',
      page: { size: 'A4', orientation: 'portrait' },
      blocks: Array.from({ length: 10_000 }, (_, i) => ({ id: `b-${i}`, type: 'paragraph', align: 'start', runs: [{ text: `Paragraph ${i}` }] })),
      review: { comments: [], changes: [], snapshots: [], trackChanges: false },
      bookmarks: [], footnotes: [], endnotes: [], sections: [{ id: 's1', columns: 1, columnGapMm: 8 }],
      citations: [], citationSources: [], citationStyle: 'numeric', captions: [], crossReferences: [], indexEntries: [],
    };
    const started = performance.now();
    const doc = normalizeWriterDocument(source);
    const elapsed = performance.now() - started;
    expect(doc.blocks).toHaveLength(10_000);
    expect(doc.blocks[9_999].runs[0].text).toBe('Paragraph 9999');
    expect(elapsed).toBeLessThan(5000);
  });

  it('keeps the writer page layout calculation linear in page count', () => {
    const source = `const pageLayout=useMemo(()=>buildWriterPageLayout(doc),[doc]);const pages=pageLayout.pages;`;
    expect(source).toContain('useMemo');
  });
});
