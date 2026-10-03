import { computeNextRunAt, shouldIncludeInIncremental } from './backup-schedule-logic';

describe('computeNextRunAt', () => {
  it('returns null for MANUAL', () => {
    expect(computeNextRunAt('MANUAL', new Date('2026-10-03T10:00:00Z'), 2, null)).toBeNull();
  });

  it('schedules next daily hour in the future', () => {
    const from = new Date('2026-10-03T10:00:00Z');
    const next = computeNextRunAt('DAILY', from, 2, null)!;
    expect(next.toISOString()).toBe('2026-10-04T02:00:00.000Z');
  });

  it('schedules same-day daily when hour is still ahead', () => {
    const from = new Date('2026-10-03T01:00:00Z');
    const next = computeNextRunAt('DAILY', from, 2, null)!;
    expect(next.toISOString()).toBe('2026-10-03T02:00:00.000Z');
  });
});

describe('shouldIncludeInIncremental', () => {
  const baseline = new Date('2026-10-01T00:00:00Z');
  const ids = new Set(['a', 'b']);

  it('includes files newer than baseline', () => {
    expect(
      shouldIncludeInIncremental({
        fileId: 'a',
        updatedAt: new Date('2026-10-02T00:00:00Z'),
        baselineSnapshotAt: baseline,
        baselineFileIds: ids,
      }),
    ).toBe(true);
  });

  it('skips unchanged known files', () => {
    expect(
      shouldIncludeInIncremental({
        fileId: 'a',
        updatedAt: new Date('2026-09-01T00:00:00Z'),
        baselineSnapshotAt: baseline,
        baselineFileIds: ids,
      }),
    ).toBe(false);
  });

  it('includes new file ids not in baseline', () => {
    expect(
      shouldIncludeInIncremental({
        fileId: 'new',
        updatedAt: new Date('2026-09-01T00:00:00Z'),
        baselineSnapshotAt: baseline,
        baselineFileIds: ids,
      }),
    ).toBe(true);
  });
});
