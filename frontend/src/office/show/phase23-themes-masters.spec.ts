import {defaultShow} from './model';
import {addMasterElement,assignMaster,addSlide,setThemePreset,updateMasterElement} from './commands';

describe('IMKAN Show Phase 6 - themes and masters',()=>{
  it('applies a theme to slide typography and background without losing content',()=>{
    let d=defaultShow();
    const before=d.slides[0].elements.map(e=>e.text);
    d=setThemePreset(d,'midnight');
    expect(d.theme.background).toBe('#0f172a');
    expect(d.slides[0].background).toBe('#0f172a');
    expect(d.slides[0].elements.map(e=>e.text)).toEqual(before);
    expect(d.slides[0].elements[0].fontFamily).toBe('Inter');
  });

  it('creates reusable master elements and keeps them on the selected master',()=>{
    let d=defaultShow();
    d=addMasterElement(d,'master-default','text');
    d=addMasterElement(d,'master-default','shape');
    expect(d.masters[0].elements).toHaveLength(2);
    const id=d.masters[0].elements[0].id;
    d=updateMasterElement(d,'master-default',id,{text:'Company header'});
    expect(d.masters[0].elements[0].text).toBe('Company header');
  });

  it('assigns a master to a new slide',()=>{
    let d=defaultShow();
    d=addSlide(d,'blank');
    expect(d.slides[1].master).toBe('master-default');
    d=assignMaster(d,'master-default');
    expect(d.slides[1].master).toBe('master-default');
  });
});
