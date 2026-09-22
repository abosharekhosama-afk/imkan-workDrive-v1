import { describe, expect, it } from 'vitest';

describe('Phase 28 threaded comments OOXML contract', () => {
  it('requires modern comments relationship and extended metadata primitives', () => {
    const source = require('fs').readFileSync('backend/src/office/office-conversion.service.ts', 'utf8');
    expect(source).toContain('commentsExtended.xml');
    expect(source).toContain('w15:commentEx');
    expect(source).toContain('w15:paraIdParent');
    expect(source).toContain('w15:done');
    expect(source).toContain('rIdCommentsExtended');
  });

  it('keeps replies as first-class review data', () => {
    const model = require('fs').readFileSync('frontend/src/office/writer/model.ts', 'utf8');
    expect(model).toContain('replies?:');
    expect(model).toContain('resolved?: boolean');
  });
});
