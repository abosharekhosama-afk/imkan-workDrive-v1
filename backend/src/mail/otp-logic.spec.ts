import { loginDelivery } from './otp-logic';

describe('loginDelivery', () => {
  it('opens a session for an existing account that signs in with a password', () => {
    expect(loginDelivery({ hasAccount: true, method: 'password' })).toBe('session');
  });

  it('still emails a code for an explicit code sign-in and for a new account', () => {
    expect(loginDelivery({ hasAccount: true, method: 'code' })).toBe('otp');
    expect(loginDelivery({ hasAccount: false, method: 'password' })).toBe('otp');
  });
});