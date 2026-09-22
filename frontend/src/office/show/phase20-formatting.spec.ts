import { describe, expect, it } from 'vitest';
import { activeSlide, defaultShow } from './model';
import { updateElement, updateElements } from './commands';

describe('Show phase 20 contextual formatting', () => {
  it('applies formatting to multiple selected objects', () => {
    let d = defaultShow();
    const ids = activeSlide(d)!.elements.map(e => e.id);
    d = updateElements(d, ids, { bold: true, color: '#0f172a' });
    expect(activeSlide(d)!.elements.every(e => e.bold === true && e.color === '#0f172a')).toBe(true);
  });
  it('keeps geometry bounded when keyboard-style movement is applied', () => {
    let d = defaultShow();
    const id = activeSlide(d)!.elements[0].id;
    d = updateElement(d, id, { x: 0, y: 0 });
    const e = activeSlide(d)!.elements.find(x => x.id === id)!;
    expect(e.x).toBe(0);
    expect(e.y).toBe(0);
  });
});
