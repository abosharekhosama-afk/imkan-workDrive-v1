import { resolveAuditReportActions } from './audit-report-logic';

describe('resolveAuditReportActions', () => {
  const map = {
    'FILES_FOLDERS:UPLOAD': ['FILE_UPLOAD_COMPLETE', 'FILE_VERSION_UPLOADED'],
    'TEAM_FOLDERS:CREATE': ['TEAM_FOLDER_CREATED'],
    'GROUPS:ADD_MEMBERS': ['GROUP_MEMBER_ADDED'],
  };
  const all = ['FILE_UPLOAD_COMPLETE', 'TEAM_FOLDER_CREATED', 'GROUP_MEMBER_ADDED'];

  it('expands UI activity keys into persisted audit actions', () => {
    expect(resolveAuditReportActions(['FILES_FOLDERS:UPLOAD', 'TEAM_FOLDERS:CREATE'], map, all)).toEqual([
      'FILE_UPLOAD_COMPLETE',
      'FILE_VERSION_UPLOADED',
      'TEAM_FOLDER_CREATED',
    ]);
  });

  it('returns all known actions when no keys are selected', () => {
    expect(resolveAuditReportActions([], map, all)).toEqual(all);
  });

  it('drops unknown keys instead of querying impossible action names', () => {
    expect(resolveAuditReportActions(['FILES_FOLDERS:UPLOAD', 'UNKNOWN:ACTION'], map, all)).toEqual([
      'FILE_UPLOAD_COMPLETE',
      'FILE_VERSION_UPLOADED',
    ]);
  });
});