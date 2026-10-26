export type AccessTokenPayload = {
  sub: string;
  org_id: string;
  email: string;
  role: string;
  membershipId?: string;
  membershipStatus?: string;
  templateAdmin?: boolean;
  jti?: string;
  /** Present only when the request was authenticated with an integration key (wdk_). */
  integrationKey?: {
    id: string;
    prefix: string;
    scopes: string[];
    rootFolderId: string | null;
  };
};

export const JWT_SECRET_ENV = 'JWT_SECRET';
