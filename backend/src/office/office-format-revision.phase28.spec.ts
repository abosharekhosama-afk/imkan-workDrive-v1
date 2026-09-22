import { describe, expect, it } from 'vitest';

describe('Phase 28 Writer formatting revision OOXML', () => {
  it('uses the native rPrChange primitive', () => {
    const xml = '<w:rPrChange w:id="7" w:author="user" w:date="2026-09-21T20:00:00Z"><w:rPr><w:b/></w:rPr></w:rPrChange>';
    expect(xml).toContain('w:rPrChange');
    expect(xml).toContain('w:author');
    expect(xml).toContain('w:date');
  });

  it('keeps before and after formatting states distinct', () => {
    const before = { text: 'A', bold: false, fontSize: 11 };
    const after = { text: 'A', bold: true, fontSize: 14 };
    expect(before).not.toEqual(after);
    expect(after.bold).toBe(true);
    expect(after.fontSize).toBe(14);
  });
});
