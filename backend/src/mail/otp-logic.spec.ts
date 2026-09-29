import { hashOtpCode, maskEmail, normalizeOtpCode, otpCodesMatch, OTP_LENGTH } from './otp-logic';

describe('otp-logic', () => {
  it('masks the local part of an email', () => {
    expect(maskEmail('amina@imkan.test')).toBe('a****@imkan.test');
  });

  it('keeps only six digits', () => {
    expect(normalizeOtpCode('12-34 56 789')).toBe('123456');
    expect(normalizeOtpCode('12-34 56 789')).toHaveLength(OTP_LENGTH);
  });

  it('matches a code only against its hash', () => {
    const hash = hashOtpCode('048291', 'pepper');
    expect(otpCodesMatch('048291', hash, 'pepper')).toBe(true);
    expect(otpCodesMatch('048292', hash, 'pepper')).toBe(false);
    expect(otpCodesMatch('048291', hash, 'other')).toBe(false);
  });
});
