import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_WINDOW_MS = 15 * 60 * 1000;
export const OTP_WINDOW_LIMIT = 5;

export type OtpPurpose = 'LOGIN' | 'SIGNUP' | 'PASSWORDLESS';

/** Password sign-in for an existing account opens a session. A code is only for a new account or an explicit code sign-in. */
export function loginDelivery(input: { hasAccount: boolean; method: 'password' | 'code' }): 'session' | 'otp' {
  if (input.method === 'code' || !input.hasAccount) return 'otp';
  return 'session';
}

export type OtpChallengeResult = {
  otp_required: true;
  challenge_id: string;
  masked_email: string;
  expires_in: number;
  purpose: OtpPurpose;
  dev_code?: string;
};

export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(OTP_LENGTH, '0');
}

export function normalizeOtpCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, OTP_LENGTH);
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const hidden = Math.max(1, local.length - 1);
  return `${local.slice(0, 1)}${'*'.repeat(hidden)}@${domain}`;
}

export function hashOtpCode(code: string, pepper: string): string {
  return createHash('sha256').update(`${pepper}:${normalizeOtpCode(code)}`).digest('hex');
}

export function otpCodesMatch(code: string, storedHash: string, pepper: string): boolean {
  const actual = Buffer.from(hashOtpCode(code, pepper), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  return actual.length === expected.length && actual.length > 0 && timingSafeEqual(actual, expected);
}
