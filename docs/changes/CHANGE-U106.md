# Implementation Record: U-106 UI Integration (slice 12)

## Objective
Join completed WorkDrive features into one content-region experience without duplicating IMKAN One chrome.

## Problem
Files, trash, activity, search, share, and upload existed as separate pages/actions. Navigation between them was inconsistent, and public-link consume (T-502) had no UI.

## Proposed change
- Content-region `WorkdriveNav` on `/files/*` (Files / Trash / Activity). Not a platform sidebar or header.
- Shared `WORKSPACE_HREFS` with no client `orgId`.
- Public consume page `GET /share/public` → `POST /share/public` (no JWT).
- i18n keys `share.token`, `share.verify` in EN/AR.

## Reason
Implementation plan item 12: one coherent UX on the existing IMKAN One content region.

## Impact
Frontend routing and navigation only. No backend changes.

## Database impact
None.

## API impact
None (reuses existing folder/file/search/share/trash/audit contracts).

## UI impact
Horizontal content nav; public share form; locale switcher remains in `WorkdriveContent`.

## Security impact
Public share page does not send `orgId`. Authenticated APIs still use JWT from the existing client.

## Permission impact
None.

## Affected specs
`docs/design/UI-IMPLEMENTATION-PLAN.md`, `docs/plan/IMPLEMENTATION-PLAN.md` item 12.

## Affected tasks
U-106.

## Testing impact
- `npx tsc --noEmit` (frontend) — success, 2026-08-16
- `node --test --experimental-strip-types src/lib/workspace-routes.spec.ts` — 2 passed
- Not run: Docker, MySQL, MinIO, `next build`, backend re-runs

## Status
IMPLEMENTED (unit). Phase 04 remains IN_PROGRESS.
