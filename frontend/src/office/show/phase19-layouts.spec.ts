import {defaultShow} from './model';
import {addSlide,setActiveSlide,setLayout} from './commands';

describe('IMKAN Show Phase 2 - slide layout workflow',()=>{
  it('creates and switches slides using supported layouts',()=>{
    let d=defaultShow();
    d=addSlide(d,'two-column');
    expect(d.slides).toHaveLength(2);
    expect(d.slides[1].layout).toBe('two-column');
    d=setActiveSlide(d,d.slides[1].id);
    d=setLayout(d,'image-text');
    expect(d.slides[1].layout).toBe('image-text');
    expect(d.slides[1].elements.length).toBeGreaterThan(0);
  });

  it('preserves the active slide when applying a layout',()=>{
    const d=defaultShow();
    const next=setLayout(d,'blank');
    expect(next.activeSlide).toBe(d.activeSlide);
    expect(next.slides[0].layout).toBe('blank');
    expect(next.slides[0].elements).toHaveLength(0);
  });
});
