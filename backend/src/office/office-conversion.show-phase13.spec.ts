import { OfficeConversionService } from './office-conversion.service';

describe('Show Phase 13 - PPTX export hardening', () => {
  it('emits a presentation with master/layout/theme relationships', async () => {
    const service = new OfficeConversionService({} as any);
    const result = await service.export('SHOW' as any, {
      title: 'Export Test', aspectRatio: '16:9', theme: { accent:'#2563eb', secondary:'#64748b', fontFamily:'Arial', headingFont:'Arial' },
      slides: [{ id:'s1', background:'#ffffff', elements:[{id:'t1',type:'text',x:10,y:10,width:40,height:20,text:'Hello',fontSize:24,bold:true},{id:'sh1',type:'shape',x:55,y:10,width:20,height:20,fill:'#ff0000',shape:'circle'}]}]
    }, 'pptx');
    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(result.buffer);
    expect(zip.file('ppt/presentation.xml')).toBeTruthy();
    expect(zip.file('ppt/slideMasters/slideMaster1.xml')).toBeTruthy();
    expect(zip.file('ppt/slideLayouts/slideLayout1.xml')).toBeTruthy();
    expect(zip.file('ppt/theme/theme1.xml')).toBeTruthy();
    expect(zip.file('ppt/slides/_rels/slide1.xml.rels')).toBeTruthy();
  });

  it('exports transitions, images and charts without losing the slide package structure', async () => {
    const service = new OfficeConversionService({} as any);
    const result = await service.export('SHOW' as any, {
      title:'Rich Export', aspectRatio:'16:9', theme:{accent:'#2563eb',secondary:'#64748b'},
      slides:[{id:'s1',transition:{type:'fade',duration:900},elements:[
        {id:'img',type:'image',x:0,y:0,width:20,height:20,src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='},
        {id:'chart',type:'chart',chartType:'bar',x:30,y:20,width:50,height:40,title:'Sales',categories:['Q1','Q2'],series:[{name:'Revenue',values:[10,20]}]}
      ]}]
    }, 'pptx');
    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(result.buffer);
    const slide = await zip.file('ppt/slides/slide1.xml')!.async('text');
    expect(slide).toContain('<p:transition');
    expect(zip.file('ppt/media/image1_2.png') || zip.file('ppt/media/image1_1.png')).toBeTruthy();
    expect(zip.file('ppt/charts/chart1.xml')).toBeTruthy();
    expect((await zip.file('ppt/slides/_rels/slide1.xml.rels')!.async('text'))).toContain('relationships/chart');
  });
});
