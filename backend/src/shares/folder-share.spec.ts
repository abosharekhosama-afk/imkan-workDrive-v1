import { ResourceType } from '@prisma/client';
import { parseCreateShare } from './create-share.schema';

describe('folder sharing contract', () => {
  it('accepts a folder resource', () => {
    expect(parseCreateShare({
      resource_type: 'FOLDER', resource_id: '00000000-0000-4000-8000-000000000001',
      can_download: true, recipient_user_ids: [], permission: 'VIEW',
    }).resourceType).toBe(ResourceType.FOLDER);
  });
});
