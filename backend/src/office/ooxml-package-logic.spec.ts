import { drawingText, maskBalanced, outerElements, relationshipMap, repairShowFromPreservation, slideCanvas, slidePieces, wordDirection, wordFlowText } from './ooxml-package-logic';

const png = Buffer.from([137, 80, 78, 71]).toString('base64');

describe('office package details', () => {
  it('keeps pictures in the same order as the slide tree', () => {
    const xml = `<p:spTree><p:sp><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>العنوان</a:t></a:r></a:p></p:txBody></p:sp><p:pic><p:blipFill><a:blip r:embed="rId2"/></p:blipFill><p:spPr><a:xfrm><a:off x="10" y="20"/><a:ext cx="30" cy="40"/></a:xfrm></p:spPr></p:pic><p:sp><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>التفاصيل</a:t></a:r></a:p></p:txBody></p:sp></p:spTree>`;
    const pieces = slidePieces(xml);
    expect(pieces.map((piece) => piece.kind)).toEqual(['shape', 'picture', 'shape']);
    expect(drawingText(pieces[0].xml)).toBe('العنوان');
    expect(drawingText(pieces[2].xml)).toBe('التفاصيل');
  });

  it('maps a grouped picture into slide coordinates', () => {
    const xml = `<p:grpSp><p:grpSpPr><a:xfrm><a:off x="100" y="200"/><a:ext cx="1000" cy="500"/><a:chOff x="0" y="0"/><a:chExt cx="1000" cy="500"/></a:xfrm></p:grpSpPr><p:pic><p:spPr><a:xfrm><a:off x="10" y="20"/><a:ext cx="30" cy="40"/></a:xfrm></p:spPr><p:blipFill><a:blip r:embed="rId9"/></p:blipFill></p:pic></p:grpSp>`;
    const pieces = slidePieces(xml);
    expect(pieces).toHaveLength(1);
    expect(pieces[0].kind).toBe('picture');
    expect(pieces[0].box.x).toBe(110);
    expect(pieces[0].box.y).toBe(220);
  });

  it('keeps paragraph breaks and does not read table tags as text', () => {
    expect(drawingText('<p:txBody><a:p><a:r><a:t>سطر</a:t></a:r></a:p><a:p><a:r><a:t>ثان</a:t></a:r></a:p></p:txBody>')).toBe('سطر\nثان');
    expect(drawingText('<a:tc><a:txBody><a:p><a:r><a:t>خلية</a:t></a:r></a:p></a:txBody></a:tc>')).toBe('خلية');
  });

  it('reads Word paragraphs in order and keeps a nested table inside its parent', () => {
    const body = '<w:p><w:r><w:t>أولا</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>جدول</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>داخلي</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:tc></w:tr></w:tbl><w:p><w:r><w:t>ثانيا</w:t></w:r></w:p>';
    expect(wordFlowText(maskBalanced(body, 'w:tbl'))).toBe('أولا\nثانيا');
    expect(outerElements(body, 'w:tbl')).toHaveLength(1);
    expect(outerElements(body, 'w:p').map((item) => wordFlowText(item.xml))).toEqual(['أولا', 'جدول', 'داخلي', 'ثانيا']);
    const nested = '<w:p><w:r><w:t>قبل</w:t></w:r><w:p><w:r><w:t>داخل</w:t></w:r></w:p><w:r><w:t>بعد</w:t></w:r></w:p><w:p><w:r><w:t>التالي</w:t></w:r></w:p>';
    const paragraphs = outerElements(nested, 'w:p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].xml).toContain('قبل');
    expect(paragraphs[0].xml).toContain('بعد');
    expect(wordDirection('<w:bidi w:val="0"/>', 'left')).toBe('ltr');
  });

  it('reads slide size even when height is written before width', () => {
    expect(slideCanvas('<p:sldSz cy="6858000" cx="9144000"/>')).toEqual({ cx: 9144000, cy: 6858000 });
  });

  it('reads a relationship when the target is written before the id', () => {
    const map = relationshipMap('<Relationship Target="../media/image1.png" Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"/>');
    expect(map.rId2.target).toBe('../media/image1.png');
  });

  it('rebuilds a picture from the preserved package when the saved slide lost it', () => {
    const slide = `<p:spTree><p:pic><p:blipFill><a:blip r:embed="rId2"/></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm></p:spPr></p:pic></p:spTree>`;
    const repaired = repairShowFromPreservation({
      type: 'SHOW',
      slides: [{ id: 's1', elements: [{ id: 'old', type: 'text', text: 'قديم' }] }],
      _ooxmlPreservation: {
        parts: {
          'ppt/slides/slide1.xml': Buffer.from(slide).toString('base64'),
          'ppt/slides/_rels/slide1.xml.rels': Buffer.from('<Relationships><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>').toString('base64'),
          'ppt/media/image1.png': png,
        },
      },
    }) as { slides: Array<{ elements: Array<{ type: string; src?: string }> }> };
    expect(repaired.slides[0].elements[0].type).toBe('image');
    expect(repaired.slides[0].elements[0].src || '').toMatch(/^data:image\/png;base64,/);
  });

  it('leaves a slide alone when its picture is already a valid image', () => {
    const kept = repairShowFromPreservation({
      type: 'SHOW',
      slides: [{ id: 's1', elements: [{ id: 'img', type: 'image', text: 'edited', src: `data:image/png;base64,${Buffer.from('12345678').toString('base64')}` }] }],
      _ooxmlPreservation: { parts: { 'ppt/slides/slide1.xml': Buffer.from('<p:spTree><p:pic></p:pic></p:spTree>').toString('base64') } },
    }) as { slides: Array<{ elements: Array<{ text?: string }> }> };
    expect(kept.slides[0].elements[0].text).toBe('edited');
  });
});