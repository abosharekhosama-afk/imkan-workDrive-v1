import { addWorkflowBusinessMinutes } from './workflow-calendar';

describe('workflow business calendar', () => {
  const cfg = { timezone: 'Asia/Gaza', workingDays: [1,2,3,4,5], workStart: '09:00', workEnd: '17:00', holidays: [] };

  it('uses the configured timezone instead of the server timezone', () => {
    const start = new Date('2026-09-21T06:00:00.000Z'); // 09:00 in Gaza in this test period
    expect(addWorkflowBusinessMinutes(start, 60, cfg).toISOString()).toBe('2026-09-21T07:00:00.000Z');
  });

  it('rolls across the local working-day boundary', () => {
    const start = new Date('2026-09-21T14:00:00.000Z'); // 17:00 local
    const result = addWorkflowBusinessMinutes(start, 60, cfg);
    expect(result.toISOString()).toBe('2026-09-22T07:00:00.000Z'); // 10:00 local next working day
  });

  it('skips configured local holidays', () => {
    const result = addWorkflowBusinessMinutes(new Date('2026-09-21T14:00:00.000Z'), 60, { ...cfg, holidays: ['2026-09-22'] });
    expect(result.toISOString()).toBe('2026-09-23T07:00:00.000Z');
  });

  it('falls back safely for an invalid timezone', () => {
    const result = addWorkflowBusinessMinutes(new Date('2026-09-21T08:00:00.000Z'), 60, { ...cfg, timezone: 'Not/AZone' });
    expect(result.toISOString()).toBe('2026-09-21T10:00:00.000Z');
  });
});
