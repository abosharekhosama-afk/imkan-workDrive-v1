import {defaultShow} from './model';
import {addSlide,setActiveSlide,setSlideTransition,setSlideTransitionDirection,setPresentationDefaults,setSlideAutoAdvance} from './commands';

describe('IMKAN Show Phase 10 - transitions and playback',()=>{
  it('stores transition effect, duration and direction',()=>{
    let d=defaultShow();
    d=addSlide(d);
    d=setSlideTransition(d,'wipe',900,'up');
    expect(d.slides[1].transition).toBe('wipe');
    expect(d.slides[1].transitionDuration).toBe(900);
    expect(d.slides[1].transitionDirection).toBe('up');
  });
  it('supports presentation defaults across all slides',()=>{
    let d=defaultShow(); d=addSlide(d); d=addSlide(d);
    d=setPresentationDefaults(d,'push',700,'right',5000);
    expect(d.slides.every(s=>s.transition==='push'&&s.transitionDuration===700&&s.transitionDirection==='right'&&s.autoAdvanceMs===5000)).toBe(true);
  });
  it('clamps auto advance to supported range',()=>{
    let d=defaultShow(); d=setSlideAutoAdvance(d,999999);
    expect(d.slides[0].autoAdvanceMs).toBe(600000);
  });
});
