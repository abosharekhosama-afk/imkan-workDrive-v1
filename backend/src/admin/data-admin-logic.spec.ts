import { classifyDataShare, containsLikePattern, dataLocationMatches, dataShareMatches, isSharePermission, normalizeAccessReason, resolveTrashDays, trashExpiresAt, uniqueResourceIds } from './data-admin-logic';

describe('data administration rules', () => {
  it('classifies team recipients apart from public and download links', () => {
    expect(classifyDataShare({ recipientCount: 2, canDownload: true })).toBe('team');
    expect(classifyDataShare({ recipientCount: 0, canDownload: true })).toBe('download');
    expect(classifyDataShare({ recipientCount: 0, canDownload: false })).toBe('internet');
  });

  it('filters shares the way the admin console labels them', () => {
    expect(dataShareMatches('team', 'internet')).toBe(false);
    expect(dataShareMatches('download', 'internet')).toBe(true);
    expect(dataShareMatches('download', 'download')).toBe(true);
    expect(dataShareMatches('internet', 'external')).toBe(true);
    expect(dataShareMatches('team', 'external')).toBe(false);
    expect(dataShareMatches('team', 'all')).toBe(true);
  });

  it('keeps personal items out of a team-folder location', () => {
    expect(dataLocationMatches(null, 'personal')).toBe(true);
    expect(dataLocationMatches('team-1', 'personal')).toBe(false);
    expect(dataLocationMatches('team-1', 'team-1')).toBe(true);
    expect(dataLocationMatches('team-1', 'all')).toBe(true);
  });

  it('requires a real reason and a supported trash retention', () => {
    expect(normalizeAccessReason('  reason  ')).toBe('reason');
    expect(normalizeAccessReason('no')).toBeNull();
    expect(resolveTrashDays(90)).toBe(90);
    expect(resolveTrashDays(14)).toBe(30);
    expect(trashExpiresAt(new Date('2026-01-01T00:00:00.000Z'), 7).toISOString()).toBe('2026-01-08T00:00:00.000Z');
  });

  it('escapes search wildcards and keeps only ids', () => {
    expect(containsLikePattern('100%_a')).toBe('%100\\%\\_a%');
    expect(isSharePermission('EDIT')).toBe(true);
    expect(isSharePermission('OWNER')).toBe(false);
    expect(uniqueResourceIds(['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'bad', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'])).toEqual(['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee']);
  });
});