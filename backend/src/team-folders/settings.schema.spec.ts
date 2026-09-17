import test from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { parseUpdateTeamFolderSettings } from './settings.schema';

test('team folder settings parser accepts supported booleans', () => {
  assert.deepEqual(parseUpdateTeamFolderSettings({ isPublicToOrg: true, allowExternalSharing: false }), {
    isPublicToOrg: true,
    allowExternalSharing: false,
  });
});

test('team folder settings parser rejects unsupported values', () => {
  assert.throws(() => parseUpdateTeamFolderSettings({ allowExternalSharing: 'yes' }), BadRequestException);
  assert.throws(() => parseUpdateTeamFolderSettings({ emailUpload: true }), BadRequestException);
});
