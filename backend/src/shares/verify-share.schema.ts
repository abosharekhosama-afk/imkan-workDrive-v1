import { BadRequestException } from '@nestjs/common';

export type VerifyShareInput = {
  token: string;
  password?: string;
  userData?: Record<string, string>;
};

export function parseVerifyShare(body: unknown): VerifyShareInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Invalid share verification payload');
  }
  const record = body as Record<string, unknown>;
  if (typeof record.token !== 'string' || record.token.length < 16) {
    throw new BadRequestException('Invalid token');
  }
  let password: string | undefined;
  if (
    record.password !== undefined &&
    record.password !== null &&
    record.password !== ''
  ) {
    if (typeof record.password !== 'string') {
      throw new BadRequestException('Invalid password');
    }
    password = record.password;
  }
  const rawUserData = record.user_data;
  let userData: Record<string, string> | undefined;
  if (rawUserData !== undefined) {
    if (!rawUserData || typeof rawUserData !== 'object' || Array.isArray(rawUserData)) throw new BadRequestException('Invalid user_data');
    userData = Object.fromEntries(Object.entries(rawUserData as Record<string, unknown>).filter(([, value]) => typeof value === 'string').map(([key, value]) => [key, String(value)]));
  }
  return { token: record.token, password, userData };
}
