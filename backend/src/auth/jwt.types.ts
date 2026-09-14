export type AccessTokenPayload = {
  sub: string;
  org_id: string;
  email: string;
  role: string;
  membershipId?: string;
  membershipStatus?: string;
  jti?: string;
};

export const JWT_SECRET_ENV = 'JWT_SECRET';
