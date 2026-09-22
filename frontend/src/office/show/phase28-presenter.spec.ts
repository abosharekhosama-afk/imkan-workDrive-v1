import {defaultShow} from './model';
import {clampSlideIndex,formatPresenterTime,presenterNextIndex,presenterProgress,presenterRemaining,presenterPrevIndex,rehearsalDuration} from './presenter';

describe('IMKAN Show Phase 11 - Presenter & Rehearsal',()=>{
  it('clamps navigation and reports presentation progress',()=>{
    const d=defaultShow();
    expect(clampSlideIndex(d,-2)).toBe(0);
    expect(presenterProgress(d,0)).toBe(100);
    expect(presenterRemaining(d,0)).toBe(0);
    expect(presenterPrevIndex(d,0)).toBe(0);
  });

  it('supports optional looping at the end of a presentation',()=>{
    const d=defaultShow();
    expect(presenterNextIndex(d,0)).toBe(-1);
    const looped={...d,presenter:{...d.presenter,loop:true}};
    expect(presenterNextIndex(looped,0)).toBe(0);
  });

  it('calculates rehearsal duration from slide auto-advance timings',()=>{
    const d=defaultShow();
    const timed={...d,slides:[{...d.slides[0],autoAdvanceMs:2500},{...d.slides[0],id:'slide-2',autoAdvanceMs:3500}]};
    expect(rehearsalDuration(timed)).toBe(6000);
    expect(formatPresenterTime(3661)).toBe('01:01:01');
  });
});
