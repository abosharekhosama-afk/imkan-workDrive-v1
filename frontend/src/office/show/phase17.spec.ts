import { describe, expect, it } from 'vitest';
import { addSection, assignSlideSection, duplicateMaster, setThemePreset } from './commands';
import { defaultShow } from './model';

describe('IMKAN Show Phase 17', () => {
  it('applies a theme preset and keeps document structure', () => {
    const d = setThemePreset(defaultShow(), 'midnight');
    expect(d.theme.background).toBe('#0f172a');
    expect(d.slides).toHaveLength(1);
  });
  it('creates and assigns slide sections', () => {
    const d1 = addSection(defaultShow(), 'Opening');
    const section = d1.sections?.[0];
    const d2 = assignSlideSection(d1, d1.slides[0].id, section?.id);
    expect(d2.slides[0].section).toBe(section?.id);
  });
  it('duplicates a master without reusing ids', () => {
    const d = duplicateMaster(defaultShow(), 'master-default');
    expect(d.masters).toHaveLength(2);
    expect(d.masters[0].id).not.toBe(d.masters[1].id);
  });
});
