import { blankTemplateAssetCandidates, templateOfficeEditorPath, templateOfficeEditorSegment } from './template-blank-assets';

describe('template-blank-assets', () => {
  it('resolves production dist layout from compiled service directory', () => {
    const candidates = blankTemplateAssetCandidates(
      'blank-document.docx',
      '/app/backend/dist/src/templates',
      '/app/backend',
    ).map((path) => path.replace(/\\/g, '/'));
    expect(candidates.some((path) => path.endsWith('/dist/templates/blank-assets/blank-document.docx'))).toBe(true);
  });

  it('maps office types and extensions to editor segments', () => {
    expect(templateOfficeEditorSegment('WRITER', null)).toBe('writer');
    expect(templateOfficeEditorSegment(null, 'xlsx')).toBe('sheet');
    expect(templateOfficeEditorSegment(null, 'pptx')).toBe('show');
    expect(templateOfficeEditorSegment(null, 'txt')).toBeNull();
  });

  it('builds stable editor paths for template working copies', () => {
    expect(
      templateOfficeEditorPath('file-1', 'WRITER', 'docx', 'tmpl-1'),
    ).toBe('/office/writer/file-1?templateId=tmpl-1');
  });
});
