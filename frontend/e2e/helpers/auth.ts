import jwt from "jsonwebtoken";

export const SEED_ORG_ID = "00000000-0000-4000-8000-000000000001";
export const SEED_ORG_B_ID = "00000000-0000-4000-8000-000000000002";

export const SEED_ADMIN = {
  id: "00000000-0000-4000-8000-000000000011",
  email: "admin@example.imkan",
  role: "ADMIN",
} as const;

export const SEED_MEMBER = {
  id: "00000000-0000-4000-8000-000000000012",
  email: "organizer@example.imkan",
  role: "MEMBER",
} as const;

export const FOREIGN_ADMIN = {
  id: "00000000-0000-4000-8000-000000000099",
  orgId: SEED_ORG_B_ID,
  email: "foreign@example.imkan",
  role: "ADMIN",
} as const;

const JWT_SECRET =
  process.env.JWT_SECRET ?? "dev_jwt_secret_must_change_in_production_min32chars";

export function signAccessToken(user: {
  id: string;
  orgId: string;
  email: string;
  role: string;
}): string {
  return jwt.sign(
    { sub: user.id, org_id: user.orgId, email: user.email, role: user.role },
    JWT_SECRET,
  );
}

export function adminAccessToken(): string {
  return signAccessToken({
    id: SEED_ADMIN.id,
    orgId: SEED_ORG_ID,
    email: SEED_ADMIN.email,
    role: SEED_ADMIN.role,
  });
}

export function memberAccessToken(): string {
  return signAccessToken({
    id: SEED_MEMBER.id,
    orgId: SEED_ORG_ID,
    email: SEED_MEMBER.email,
    role: SEED_MEMBER.role,
  });
}

export function foreignTenantAccessToken(): string {
  return signAccessToken(FOREIGN_ADMIN);
}

export async function setAccessToken(page: import("@playwright/test").Page, token: string) {
  await page.addInitScript((value: string) => {
    window.localStorage.setItem("workdrive_access_token", value);
  }, token);
}

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:3001";
