import {defaultShow} from './model';
import {smartSnapElement} from './geometry';
import {applyObjectStyle,updateElement} from './commands';

describe('IMKAN Show Phase 5 - smart styling and guides',()=>{
  it('snaps an object to the slide center and exposes a guide',()=>{
    const d=defaultShow();
    const source={...d.slides[0].elements[0],id:'moving',x:49.4,y:20,width:20,height:10};
    const result=smartSnapElement(source,d.slides[0].elements);
    expect(result.element.x).toBe(50);
    expect(result.guides.some(g=>g.axis==='x')).toBe(true);
  });
  it('applies professional style properties without changing geometry',()=>{
    const d=defaultShow();
    const id=d.slides[0].elements[0].id;
    const styled=applyObjectStyle(d,[id],{opacity:.65,border:true,borderColor:'#111827',borderWidth:3,shadow:true,textDirection:'rtl'});
    const e=styled.slides[0].elements[0];
    expect(e.opacity).toBe(.65); expect(e.borderWidth).toBe(3); expect(e.textDirection).toBe('rtl');
    expect(e.x).toBe(d.slides[0].elements[0].x);
  });
  it('keeps style updates isolated to the selected object',()=>{
    const d=defaultShow(); const id=d.slides[0].elements[0].id;
    const next=updateElement(d,id,{shadow:true,shadowBlur:18});
    expect(next.slides[0].elements[0].shadowBlur).toBe(18);
    expect(next.slides[0].elements[1].shadow).toBeUndefined();
  });
});
