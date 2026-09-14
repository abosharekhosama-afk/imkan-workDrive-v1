import { BadRequestException } from '@nestjs/common';

export type VerifyShareInput = {
  token: string;
  password?: string;
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
  return { token: record.token, password };
}
