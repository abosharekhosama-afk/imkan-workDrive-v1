import { OfficeService } from './office.service';

describe('OfficeService content foundation', () => {
  const service = Object.create(OfficeService.prototype) as OfficeService;

  it('normalizes writer content to schema 2', () => {
    const result = (service as any).normalizeOfficeContent({ type: 'writer', blocks: [{ id: 'a', type: 'heading1', align: 'center', runs: [{ text: 'Hello', bold: true }] }] });
    expect(result.schema).toBe(2);
    expect(result.type).toBe('WRITER');
    expect(result.blocks).toHaveLength(1);
  });

  it('rejects unsupported office types', () => {
    expect(() => (service as any).normalizeOfficeContent({ type: 'PDF' })).toThrow();
  });

  it('rejects invalid state', () => {
    expect(() => (service as any).normalizeOfficeContent(null)).toThrow();
  });
});
