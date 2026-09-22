import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('IMKAN Show Phase 12 — PPTX import contract', () => {
  const source = readFileSync(join(__dirname, 'office-conversion.service.ts'), 'utf8');

  it('imports native slide order and presentation aspect ratio', () => {
    expect(source).toContain("ppt/presentation.xml");
    expect(source).toContain('p:sldId');
    expect(source).toContain("aspectRatio:aspect");
  });

  it('maps text, rich text properties, RTL and rotation', () => {
    expect(source).toContain("type:'text'");
    expect(source).toContain('textDirection');
    expect(source).toContain('fontFamily');
    expect(source).toContain('bold:Boolean(first.bold)');
    expect(source).toContain('rotation:(/<a:xfrm');
  });

  it('imports shapes, connector lines, images and editable tables', () => {
    expect(source).toContain("type:'shape'");
    expect(source).toContain("type:'line'");
    expect(source).toContain("type:'image'");
    expect(source).toContain("type:'table'");
    expect(source).toContain('rows');
  });

  it('imports cached chart data as a native Show chart object', () => {
    expect(source).toContain("type:'chart'");
    expect(source).toContain('categories');
    expect(source).toContain('series');
    expect(source).toContain('chartPath');
  });

  it('imports speaker notes and reports unsupported motion metadata without flattening', () => {
    expect(source).toContain('notesSlide');
    expect(source).toContain('PPTX_NOTES');
    expect(source).toContain('PPTX_MOTION');
    expect(source).toContain('_ooxmlPreservation');
  });
});
