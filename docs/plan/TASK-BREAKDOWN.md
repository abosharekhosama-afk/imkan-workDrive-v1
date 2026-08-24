# Task Breakdown

## T-100: Foundation
- T-101: Init Next.js app with IMKAN One tokens. — PASS (`npx next build` 2026-08-16; IMKAN One tokens still local fallbacks)
- T-102: Init NestJS API. — PASS (scaffold + `nest build`)
- T-103: Setup Prisma ORM and initial MySQL migrations. — PASS (local MySQL 8.4; migrations applied)
- T-104: Configure MinIO via Docker Compose. — PASS (compose file only; Docker must not be started). Live bytes use `STORAGE_DRIVER=local` (T-405).

## T-200: Auth & Tenancy
- T-201: JWT Auth middleware enforcing `org_id`. — PASS (unit)
- T-202: Seed script for 1 Org, 3 Users. — PASS (local MySQL seed)

## T-300: Folders
- T-301: `POST /folders` API + Tests. — PASS (unit; Prisma mocked)
- T-302: `GET /folders/:id` API + Tests. — PASS (unit; Prisma mocked)

## T-400: Files & S3
- T-401: S3 Service wrapper (generate signed URLs). — PASS (unit; S3 client mocked)
- T-402: `POST /files/upload-request`. — PASS (unit; StorageService mocked)
- T-403: `POST /files/upload-complete`. — PASS (unit; StorageService mocked)
- T-404: `GET /files/:id/download`. — PASS (unit; StorageService mocked)
- T-405: Local object storage (Windows, no Docker). — PASS (local disk adapter + MySQL integration e2e)

## T-500: Sharing
- T-501: `POST /shares` for public links. — PASS (unit)
- T-502: Password verification on public links. — PASS (unit)

## UI (docs/design/UI-IMPLEMENTATION-PLAN.md)
- U-101: Scaffold routing (Next.js App Router). — PASS (`/` → `/files`, `/files/[folderId]`)
- U-102: Implement layout shell. — PASS (content region only; no duplicate platform chrome)
- U-103: Implement File Browser page. — PASS (unit; calls `/folders` APIs)
- U-104: Implement Share Modal. — PASS (unit; `POST /shares` contract)
- U-105: Rename/Delete modals + drag-and-drop upload. — PASS (unit; prior session)
- U-106: UI Integration (slice 12). — PASS (unit; content-region nav + public share consume)

## Search
- T-601: `GET /search?q=` MySQL full-text on names. — PASS (unit; not re-run this turn)

## Trash / Restore
- T-701: List trash + restore file. — PASS (unit)

## Audit
- T-801: `GET /audit` activity listing + `/files/activity` UI. — PASS (unit)
- B-P04-IDOR-LIVE: Cross-tenant IDOR against real MySQL. — PASS (18/18 e2e)
- B-P04-E2E-BROWSER: Playwright complete WorkDrive flow. — PASS (10/10)
