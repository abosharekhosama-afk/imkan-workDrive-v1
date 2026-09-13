import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scryptAsync(secret, salt, 64)) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifySecret(
  secret: string,
  stored: string,
): Promise<boolean> {
  const [salt, digest] = stored.split(':');
  if (!salt || !digest) {
    return false;
  }
  const derived = (await scryptAsync(secret, salt, 64)) as Buffer;
  const expected = Buffer.from(digest, 'hex');
  if (expected.length !== derived.length) {
    return false;
  }
  return timingSafeEqual(expected, derived);
}

export function createShareToken(): string {
  return randomBytes(32).toString('base64url');
}
