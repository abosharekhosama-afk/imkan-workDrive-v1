import {defaultShow} from './model';
import {addElement,addElementAnimation,animationTimelineDuration,normalizeElementAnimations,reorderElementAnimation,updateElementAnimation} from './commands';

describe('IMKAN Show Phase 9 - animation timeline',()=>{
  it('adds, edits and normalizes ordered animations',()=>{
    let d=addElement(defaultShow(),'shape');
    const id=d.slides[0].elements.at(-1)!.id;
    d=addElementAnimation(d,id,{type:'fade',phase:'entrance',duration:400,delay:100,trigger:'on-click'});
    d=addElementAnimation(d,id,{type:'pulse',phase:'emphasis',duration:700,delay:50,trigger:'after-previous'});
    d=updateElementAnimation(d,id,0,{duration:650});
    d=reorderElementAnimation(d,id,0,1);
    d=normalizeElementAnimations(d,id);
    const e=d.slides[0].elements.find(x=>x.id===id)!;
    expect(e.animations).toHaveLength(2);
    expect(e.animations![0].order).toBe(1);
    expect(e.animations![0].duration).toBe(700);
    expect(e.animations![1].order).toBe(2);
  });

  it('calculates timeline duration from delay plus duration',()=>{
    let d=addElement(defaultShow(),'text');
    const id=d.slides[0].elements.at(-1)!.id;
    d=addElementAnimation(d,id,{type:'fade',duration:500,delay:100,phase:'entrance',trigger:'on-click'});
    d=addElementAnimation(d,id,{type:'pulse',duration:900,delay:1200,phase:'emphasis',trigger:'after-previous'});
    const e=d.slides[0].elements.find(x=>x.id===id)!;
    expect(animationTimelineDuration(e)).toBe(2100);
  });
});
