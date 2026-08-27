import { createHmac, timingSafeEqual } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { parseTenantObjectKey } from './object-key';

export type ObjectAccessMethod = 'PUT' | 'GET';

export type ObjectAccessPayload = {
  method: ObjectAccessMethod;
  objectKey: string;
  exp: number;
  contentType?: string;
};

type TokenBody = {
  m: ObjectAccessMethod;
  k: string;
  exp: number;
  ct?: string;
};

export function signObjectAccess(
  secret: string,
  payload: ObjectAccessPayload,
): string {
  parseTenantObjectKey(payload.objectKey);
  const body: TokenBody = {
    m: payload.method,
    k: payload.objectKey,
    exp: payload.exp,
  };
  if (payload.contentType) {
    body.ct = payload.contentType;
  }
  const encoded = Buffer.from(JSON.stringify(body), 'utf8').toString(
    'base64url',
  );
  const mac = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${mac}`;
}

export function verifyObjectAccess(
  secret: string,
  token: string,
  method: ObjectAccessMethod,
): ObjectAccessPayload {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new UnauthorizedException('Invalid storage token');
  }
  const [encoded, mac] = parts;
  const expected = createHmac('sha256', secret)
    .update(encoded)
    .digest('base64url');
  const actualBuf = Buffer.from(mac);
  const expectedBuf = Buffer.from(expected);
  if (
    actualBuf.length !== expectedBuf.length ||
    !timingSafeEqual(actualBuf, expectedBuf)
  ) {
    throw new UnauthorizedException('Invalid storage token');
  }
  let body: TokenBody;
  try {
    body = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as TokenBody;
  } catch {
    throw new UnauthorizedException('Invalid storage token');
  }
  if (body.m !== method) {
    throw new UnauthorizedException('Invalid storage token');
  }
  if (typeof body.exp !== 'number' || body.exp * 1000 <= Date.now()) {
    throw new UnauthorizedException('Storage token expired');
  }
  try {
    parseTenantObjectKey(body.k);
  } catch {
    throw new UnauthorizedException('Invalid storage token');
  }
  return {
    method: body.m,
    objectKey: body.k,
    exp: body.exp,
    contentType: body.ct,
  };
}
