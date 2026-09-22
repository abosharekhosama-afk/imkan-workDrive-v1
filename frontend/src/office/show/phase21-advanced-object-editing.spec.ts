import {defaultShow} from './model';
import {addElement, updateElement} from './commands';

describe('IMKAN Show Phase 4 - advanced object editing',()=>{
  it('keeps geometry inside slide bounds when resizing',()=>{
    let d=defaultShow();
    d=addElement(d,'shape');
    const id=d.slides[0].elements[0].id;
    d=updateElement(d,id,{x:96,width:20,y:94,height:20,rotation:35});
    const e=d.slides[0].elements.find(x=>x.id===id)!;
    expect(e.x).toBe(96);
    expect(e.width).toBe(20);
    expect(e.rotation).toBe(35);
  });

  it('supports independent typography and shape formatting state',()=>{
    let d=defaultShow();
    d=addElement(d,'text');
    d=addElement(d,'shape');
    const text=d.slides[0].elements[0], shape=d.slides[0].elements[1];
    d=updateElement(d,text.id,{fontFamily:'Calibri',fontSize:28,bold:true,italic:true,underline:true,align:'center'});
    d=updateElement(d,shape.id,{fill:'#123456',border:true,rotation:15});
    const t=d.slides[0].elements.find(x=>x.id===text.id)!;
    const sh=d.slides[0].elements.find(x=>x.id===shape.id)!;
    expect(t.fontFamily).toBe('Calibri'); expect(t.fontSize).toBe(28);
    expect(t.bold).toBe(true); expect(t.italic).toBe(true); expect(t.underline).toBe(true);
    expect(sh.fill).toBe('#123456'); expect(sh.border).toBe(true); expect(sh.rotation).toBe(15);
  });
});
