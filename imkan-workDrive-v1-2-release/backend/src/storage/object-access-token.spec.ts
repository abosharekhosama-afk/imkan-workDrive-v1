import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { signObjectAccess, verifyObjectAccess } from './object-access-token';
import { buildTenantObjectKey } from './object-key';

const SECRET = 'test-signing-secret-32chars-minimum';
const ORG_A = '00000000-0000-4000-8000-000000000001';
const FILE_ID = '00000000-0000-4000-8000-000000000021';
const VERSION_ID = '00000000-0000-4000-8000-000000000031';

describe('object-access-token', () => {
  const objectKey = buildTenantObjectKey(ORG_A, FILE_ID, VERSION_ID);

  it('round-trips a PUT token with content type', () => {
    const exp = Math.floor(Date.now() / 1000) + 900;
    const token = signObjectAccess(SECRET, {
      method: 'PUT',
      objectKey,
      exp,
      contentType: 'text/plain',
    });
    expect(verifyObjectAccess(SECRET, token, 'PUT')).toEqual({
      method: 'PUT',
      objectKey,
      exp,
      contentType: 'text/plain',
    });
  });

  it('rejects a GET token used for PUT', () => {
    const token = signObjectAccess(SECRET, {
      method: 'GET',
      objectKey,
      exp: Math.floor(Date.now() / 1000) + 900,
    });
    expect(() => verifyObjectAccess(SECRET, token, 'PUT')).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an expired token', () => {
    const token = signObjectAccess(SECRET, {
      method: 'GET',
      objectKey,
      exp: Math.floor(Date.now() / 1000) - 10,
    });
    expect(() => verifyObjectAccess(SECRET, token, 'GET')).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a tampered token', () => {
    const token = signObjectAccess(SECRET, {
      method: 'GET',
      objectKey,
      exp: Math.floor(Date.now() / 1000) + 900,
    });
    const tampered = `${token}x`;
    expect(() => verifyObjectAccess(SECRET, tampered, 'GET')).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token signed with a different secret', () => {
    const token = signObjectAccess('other-secret-32chars-minimum-ok', {
      method: 'GET',
      objectKey,
      exp: Math.floor(Date.now() / 1000) + 900,
    });
    expect(() => verifyObjectAccess(SECRET, token, 'GET')).toThrow(
      UnauthorizedException,
    );
  });
});
