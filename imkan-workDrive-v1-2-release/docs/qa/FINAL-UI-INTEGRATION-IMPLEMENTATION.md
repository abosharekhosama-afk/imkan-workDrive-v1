# IMKAN WorkDrive — UI / API Integration Implementation

## Objective

This revision establishes the production-oriented WorkDrive shell and authentication entry flow while preserving the existing IMKAN One token contract and connecting UI operations to the existing backend APIs.

## Design rule

- Zoho WorkDrive is treated as a UX/information-architecture reference only.
- IMKAN One tokens, typography, spacing, RTL/LTR rules and components remain the visual authority.
- No Zoho branding or proprietary assets are introduced.
- No fake API capabilities are introduced.

## Implemented in this revision

- Enterprise WorkDrive header with brand, global search, workspace navigation, profile menu and locale controls.
- Responsive navigation for Files, Recent, Team Folders, Trash and Activity.
- Authentication routes: `/auth/login`, `/auth/signup`, `/auth/callback`.
- Real backend password login/signup endpoints.
- Real Google OAuth authorization-code callback flow when Google credentials are configured.
- Google identity persistence through `users.google_id`.
- Session guard for the files workspace.
- Sign-out clears the client session and returns to login.
- Existing file, folder, favorite, recent, sharing, preview, version and team-folder API clients remain the source of truth for workspace operations.
- New Google migration: `20260823190000_google_auth`.

## Verification status

The source revision was inspected after modification. The execution environment did not contain usable local npm binaries for a final TypeScript/Next/Nest build, so this archive must be subjected to the project's normal Quality Gate on a development machine after dependencies are installed.

Required final gate:

1. `cd backend && npm ci && npx prisma validate && npx prisma generate && npm run build && npm test`
2. `cd frontend && npm ci && npm run typecheck && npm run lint && npm run build && npm test`
3. Configure Google OAuth and run browser E2E against a running backend/frontend.

## Google OAuth configuration

Backend environment variables:

- `GOOGLE_ID`
- `GOOGLE_SECRET`
- `GOOGLE_CALLBACK_URL`
- `FRONTEND_URL`

Default local callback: `http://localhost:3001/auth/google/callback`.
