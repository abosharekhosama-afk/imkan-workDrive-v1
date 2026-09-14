import {
  contentDispositionInline,
  contentDispositionAttachment,
} from './content-disposition';

describe('contentDisposition', () => {
  it('pairs an ascii fallback with the RFC5987 utf-8 file name', () => {
    const header = contentDispositionInline('عقد 2026.pdf');
    expect(header.startsWith('inline; filename="')).toBe(true);
    expect(header).toContain("filename*=UTF-8''%D8%B9%D9%82%D8%AF");
    // legacy ascii parameter carries no non-ASCII bytes
    const ascii = header.split(';')[1];
    expect(ascii).toMatch(/^ filename="[^\u0080-\uFFFF]*"/);
  });

  it('keeps ascii names quoted without a duplicate surrogate', () => {
    expect(contentDispositionInline('Report Q3 final.pdf')).toBe(
      'inline; filename="Report Q3 final.pdf"; filename*=UTF-8\'\'Report%20Q3%20final.pdf',
    );
  });

  it('escapes quotes and backslashes in the legacy attachment name', () => {
    const header = contentDispositionAttachment('we"ird\\name.txt');
    expect(header.startsWith('attachment; ')).toBe(true);
    const match = /filename="([^"]*)"/.exec(header);
    expect(match).not.toBeNull();
    expect(match![1]).toContain('we_ird');
    expect(match![1]).not.toContain('"');
    expect(match![1]).not.toContain('\\');
  });
});