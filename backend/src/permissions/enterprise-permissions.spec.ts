import { PermissionService } from './permission.service';
import { TeamFolderRole } from '@prisma/client';

describe('enterprise permission invariants', () => {
  const service = new PermissionService({ findRole: () => TeamFolderRole.COMMENTER });
  const user:any = { sub:'u1', org_id:'o1', role:'MEMBER' };
  test('personal resources remain owner-only', () => {
    expect(service.canRead(user,{orgId:'o1',ownerId:'u2'})).toBe(false);
    expect(service.canWrite(user,{orgId:'o1',ownerId:'u2'})).toBe(false);
  });
  test('commenter can comment but cannot share or write', () => {
    const resource={orgId:'o1',ownerId:'u2',teamFolderId:'tf1',teamFolderRole:TeamFolderRole.COMMENTER};
    expect(service.canRead(user,resource)).toBe(true);
    expect(service.canComment(user,resource)).toBe(true);
    expect(service.canWrite(user,resource)).toBe(false);
    expect(service.canShare(user,resource)).toBe(false);
  });
  test('public team folders grant view only', () => {
    const resource={orgId:'o1',ownerId:'u2',teamFolderId:'tf1',isPublicToOrg:true};
    expect(service.canRead(user,resource)).toBe(true);
    expect(service.canWrite(user,resource)).toBe(false);
  });
  test('cross tenant resources are denied', () => {
    expect(service.canRead(user,{orgId:'o2',ownerId:'u1'})).toBe(false);
  });
});
