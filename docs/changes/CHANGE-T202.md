# Implementation Record: T-202 Seed

## Objective
Seed script for 1 organization and 3 users.

## Files
- `backend/src/auth/seed-data.ts`
- `backend/src/auth/seed-data.spec.ts`
- `backend/prisma/seed.ts`

## Users
- `admin@example.imkan` — OrgRole.ADMIN
- `organizer@example.imkan` — OrgRole.MEMBER (org-level schema has only ADMIN/MEMBER)
- `viewer@example.imkan` — OrgRole.MEMBER

## Tests executed
`seed-data.spec.ts` — 1 passed (static contract).

## Status
PARTIAL. `prisma db seed` NOT RUN (no applied MySQL schema / approved database).
