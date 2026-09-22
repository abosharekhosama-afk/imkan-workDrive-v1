import { OfficeConversionService } from './office-conversion.service';

describe('Show Phase 15 - PDF export certification', () => {
  const service = () => new OfficeConversionService({} as any);

  it('exports a valid static PDF with one page per slide and native text', async () => {
    const s = service();
    const source = {
      title: 'PDF Certification', aspectRatio: '16:9',
      slides: [
        { background: '#ffffff', elements: [
          { type: 'text', x: 8, y: 8, width: 70, height: 10, text: 'IMKAN Show PDF', fontSize: 28, bold: true },
          { type: 'shape', x: 10, y: 30, width: 30, height: 20, fill: '#2563eb', borderColor: '#111827', borderWidth: 1 },
        ]},
        { background: '#f8fafc', elements: [
          { type: 'text', x: 8, y: 8, width: 70, height: 10, text: 'Second slide', fontSize: 20 },
        ]},
      ],
    };
    const out = await s.export('SHOW' as any, source, 'pdf');
    expect(out.mimeType).toBe('application/pdf');
    expect(out.filename).toBe('PDF Certification.pdf');
    expect(out.buffer.subarray(0, 8).toString('binary')).toContain('%PDF-1.4');
    expect(out.buffer.toString('binary')).toContain('IMKAN Show PDF');
    expect(out.buffer.toString('binary')).toContain('/Count 2');
    expect(out.buffer.toString('binary')).toContain('%%EOF');
  });

  it('supports PNG data-URI images in static PDF output', async () => {
    const s = service();
    const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAwMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==';
    const out = await s.export('SHOW' as any, {title:'Image PDF',slides:[{elements:[{type:'image',x:10,y:10,width:20,height:20,src:png}]}]}, 'pdf');
    expect(out.buffer.toString('binary')).toContain('/Subtype /Image');
    expect(out.buffer.toString('binary')).toContain('/Filter /FlateDecode');
  });

  it('diagnoses static-media and speaker-note limitations instead of silently claiming full parity', async () => {
    const s = service();
    const report:any = await s.diagnose('SHOW' as any, {slides:[{notes:'notes',elements:[{type:'video',x:1,y:1,width:20,height:20}]}]}, 'pdf');
    expect(report.diagnostics.some((d:any)=>d.code==='SHOW_PDF_MEDIA')).toBe(true);
    expect(report.diagnostics.some((d:any)=>d.code==='SHOW_PDF_NOTES')).toBe(true);
    expect(report.diagnostics.some((d:any)=>d.code==='SHOW_PDF_CORE')).toBe(true);
  });
});
