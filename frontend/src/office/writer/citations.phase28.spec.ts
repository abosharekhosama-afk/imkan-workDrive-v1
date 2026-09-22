import { buildBibliographyEntries, findDuplicateCitationSource, formatCitationSource, rebuildCitationDisplay, removeCitationSource, setCitationStyle, upsertCitationSource } from './commands';
import { emptyWriterDocument } from './model';

describe('Phase 28 citation source registry', () => {
  it('upserts a structured source without losing metadata', () => {
    const doc = upsertCitationSource(emptyWriterDocument(), { id: 's1', type: 'article', author: 'A. Author', year: '2026', title: 'Deep Office', containerTitle: 'Journal', doi: '10.1000/example' });
    expect(doc.citationSources[0].doi).toBe('10.1000/example');
    expect(doc.citationSources[0].containerTitle).toBe('Journal');
  });

  it('formats bibliography metadata deterministically', () => {
    const text = formatCitationSource({ id: 's1', type: 'book', author: 'A. Author', year: '2026', title: 'Deep Office', publisher: 'IMKAN Press' });
    expect(text).toContain('A. Author (2026). Deep Office');
    expect(text).toContain('IMKAN Press');
  });

  it('materializes only sources actually cited', () => {
    const doc = emptyWriterDocument();
    doc.citationSources = [
      { id: 's1', type: 'book', author: 'A', title: 'Used' },
      { id: 's2', type: 'book', author: 'B', title: 'Unused' },
    ];
    doc.citations = [{ id: 'c1', source: 's1', sourceId: 's1', blockId: 'p1' }];
    const entries = buildBibliographyEntries(doc);
    expect(entries).toHaveLength(1);
    expect(entries[0].sourceId).toBe('s1');
  });
});


describe('Phase 28 citation lifecycle and style abstraction', () => {
  it('detects duplicates and reuses the existing source identity', () => {
    const doc = upsertCitationSource(emptyWriterDocument(), { id: 's1', type: 'book', author: 'A. Author', year: '2026', title: 'Deep Office', publisher: 'IMKAN Press' });
    expect(findDuplicateCitationSource(doc, { type: 'book', author: 'A. Author', year: '2026', title: 'Deep Office', publisher: 'IMKAN Press' })?.id).toBe('s1');
    const updated = upsertCitationSource(doc, { type: 'book', author: 'A. Author', year: '2026', title: 'Deep Office', publisher: 'IMKAN Press' });
    expect(updated.citationSources).toHaveLength(1);
    expect(updated.citationSources[0].id).toBe('s1');
  });

  it('supports APA, MLA and Chicago bibliography output', () => {
    const source = { id: 's1', type: 'article' as const, author: 'A. Author', year: '2026', title: 'Deep Office', containerTitle: 'Journal', publisher: 'IMKAN Press', url: 'https://example.test' };
    expect(formatCitationSource(source, 'apa')).toContain('A. Author (2026). Deep Office.');
    expect(formatCitationSource(source, 'mla')).toContain('“Deep Office.”');
    expect(formatCitationSource(source, 'chicago')).toContain('“Deep Office.”');
  });

  it('rebuilds inline citation displays when style changes', () => {
    let doc = emptyWriterDocument();
    doc = upsertCitationSource(doc, { id: 's1', type: 'book', author: 'A. Author', year: '2026', title: 'Deep Office' });
    doc = { ...doc, citations: [{ id: 'c1', source: 's1', sourceId: 's1', blockId: doc.blocks[0].id }] };
    doc = setCitationStyle(doc, 'apa');
    expect(doc.blocks[0].runs[0].text).toBe('(Author, 2026)');
    doc = setCitationStyle(doc, 'numeric');
    expect(doc.blocks[0].runs[0].text).toBe('[1]');
  });

  it('refuses source deletion while the source is still cited', () => {
    let doc = emptyWriterDocument();
    doc = upsertCitationSource(doc, { id: 's1', type: 'book', title: 'Used' });
    doc = { ...doc, citations: [{ id: 'c1', source: 's1', sourceId: 's1', blockId: doc.blocks[0].id }] };
    expect(removeCitationSource(doc, 's1').citationSources).toHaveLength(1);
    doc = { ...doc, citations: [] };
    expect(removeCitationSource(doc, 's1').citationSources).toHaveLength(0);
  });
});
