import { OfficeConversionService } from './office-conversion.service';

describe('Show Phase 14 - PPTX semantic round-trip certification', () => {
  const service = () => new OfficeConversionService({} as any);
  const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

  it('keeps a multi-slide native Show document semantically stable', async () => {
    const s=service();
    const source={title:'Round Trip',aspectRatio:'16:9',theme:{accent:'#2563eb',secondary:'#64748b',background:'#ffffff',fontFamily:'Arial',headingFont:'Arial'},slides:[
      {id:'s1',layout:'title-content',background:'#ffffff',transition:{type:'fade',duration:900},elements:[
        {id:'t1',type:'text',x:5,y:5,width:80,height:15,text:'Hello world',fontSize:24,fontFamily:'Arial',bold:true,align:'center',textDirection:'ltr'},
        {id:'sh1',type:'shape',x:10,y:30,width:30,height:20,shape:'circle',fill:'#ff0000',borderColor:'#000000',borderWidth:1}
      ]},
      {id:'s2',layout:'blank',background:'#f8fafc',elements:[{id:'img',type:'image',x:45,y:20,width:30,height:30,src:image}]}
    ]};
    const r:any=await s.roundTrip('SHOW' as any,source,'pptx');
    expect(r.roundTrip.performed).toBe(true);
    expect(r.roundTrip.reimportedType).toBe('SHOW');
    expect(r.roundTrip.sourceMetrics.slides).toBe(2);
    expect(r.roundTrip.roundTripMetrics.slides).toBe(2);
    expect(r.roundTrip.comparisons.length).toBeGreaterThan(0);
    expect(r.roundTrip.comparisons.some((x:any)=>x.path==='slides[0].elements[0].text'&&x.status==='preserved')).toBe(true);
    expect(r.roundTrip.comparisons.some((x:any)=>x.path==='slides[1].elements[0].image'&&x.status==='preserved')).toBe(true);
    expect(r.roundTrip.comparisons.some((x:any)=>x.path==='slides[0].elements[0].textDirection'&&x.source==='ltr'&&x.roundTrip==='ltr'&&x.status==='preserved')).toBe(true);
    expect(r.roundTrip.roundTripMetrics.elements).toBe(r.roundTrip.sourceMetrics.elements);
    expect(r.roundTrip.roundTripMetrics.images).toBe(r.roundTrip.sourceMetrics.images);
    expect(r.roundTrip.certification).toBe('synthetic-native');
  });

  it('identifies speaker notes as an explicit known loss rather than silently passing', async () => {
    const s=service();
    const source={title:'Notes',aspectRatio:'16:9',slides:[{id:'s1',notes:'Presenter note',elements:[{id:'t',type:'text',x:1,y:1,width:40,height:20,text:'Slide'}]}]};
    const r:any=await s.roundTrip('SHOW' as any,source,'pptx');
    expect(r.roundTrip.comparisons.some((x:any)=>x.path==='slides[0].notes'&&x.status==='loss')).toBe(true);
    expect(r.roundTrip.lossCount).toBeGreaterThan(0);
  });

  it('maps basic PPTX transition OOXML back to Show transition metadata', async () => {
    const s=service();
    const source={title:'Transition',aspectRatio:'16:9',slides:[{id:'s1',transition:{type:'push',duration:900},elements:[{id:'t',type:'text',x:1,y:1,width:40,height:20,text:'Slide'}]}]};
    const exported=await s.export('SHOW' as any,source,'pptx');
    const imported:any=await s.import(exported.buffer,exported.filename);
    expect(imported.content.slides[0].transition).toBe('push');
    expect(imported.content.slides[0].transitionDuration).toBe(900);
  });
});
