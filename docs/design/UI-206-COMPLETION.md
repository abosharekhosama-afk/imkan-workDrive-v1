# UI-206 — Loading, Empty, Error & Feedback States
**Status**: ✅ PASS
**Task ID**: UI-206
## 1. Objective
Replace abrupt plain-text loading, empty, and API error presentation with reusable IMKAN One state components while preserving existing application behavior and APIs.

## 2. Existing state architecture discovered
FileBrowser, Team Folders, Trash, and Activity used empty arrays as implicit loading states, plain text empty messages, and duplicated plain error strings. Existing `ApiError` status handling distinguished only unauthenticated errors. UI-201 semantic utilities and UI-204 Toast/Modal were already available.

## 3. Exact UI-206 scope
The documented scope covers `empty-state.tsx`, `skeleton-loader.tsx`, `alert-banner.tsx`, and integration into FileBrowser, Team Folders, Trash, and Activity. Loading skeletons, meaningful empty states, safe API alerts, and real retry actions were implemented. UI-207 and UI-208 remain out of scope.

## 4. Files changed
- `frontend/src/components/empty-state.tsx`
- `frontend/src/components/skeleton-loader.tsx`
- `frontend/src/components/alert-banner.tsx`
- `frontend/src/components/feedback-state-logic.ts`
- `frontend/src/components/feedback-state-logic.spec.ts`
- `frontend/src/components/file-table.tsx`
- `frontend/src/components/file-browser.tsx`
- `frontend/src/app/files/team-folders/page.tsx`
- `frontend/src/app/files/trash/page.tsx`
- `frontend/src/app/files/activity/page.tsx`
- `frontend/src/app/globals.css`
- `frontend/src/i18n/messages/en.json`
- `frontend/src/i18n/messages/ar.json`
- `frontend/package.json`
- `docs/design/UI-COMPLETION-PLAN.md`
- `docs/agent/CURRENT-TASK.md`
- `docs/design/UI-206-COMPLETION.md`

## 5. Loading states
FileBrowser, Team Folders, Trash, and Activity now track loading explicitly and render structure-appropriate skeletons while API promises are pending.

## 6. Skeleton states
`SkeletonLoader` is reusable, supports configurable rows/columns, reflects list/table structure, exposes `aria-busy`, and uses semantic muted/border tokens. No fabricated content or columns were added.

## 7. Empty states
`EmptyState` provides a heading, optional description, semantic panel, and optional action slot. File lists support empty-folder and no-search-results messaging. Team Folders, Trash, and Activity now have contextual empty states. No unsupported actions were invented.

## 8. Error states
`AlertBanner` presents localized persistent API errors using `role="alert"`. 401, 403, and generic errors map to safe user-facing messages without technical details.

## 9. Retry behavior
Retry buttons call the existing page `load()` operation. No new endpoints, clients, authentication logic, or fake retries were introduced.

## 10. Alert/feedback behavior
Persistent API errors use `AlertBanner`. Existing UI-204 Toast remains the transient feedback mechanism; UI-205 upload feedback was not redesigned or duplicated.

## 11. i18n
English and Arabic keys were added for forbidden access, retry, no-search-results descriptions, and team-folder empty descriptions. Existing locale architecture remains unchanged.

## 12. RTL/LTR
State components use inherited document direction, flex flow, logical inline sizing, and text flow. No new physical left/right layout rules were added.

## 13. Dark mode
Panels, skeletons, alerts, borders, text, focus, and controls use existing semantic IMKAN tokens and inherit the UI-201 dark-mode contract.

## 14. IMKAN One compliance
Existing UI-201 `imkan-panel`, `imkan-alert`, `imkan-heading`, `imkan-muted`, `imkan-meta`, `imkan-divider`, and focus/button utilities are reused. No arbitrary colors, new brand values, Zoho styling, or second design system were introduced. The documented fallback strategy remains active because authoritative status colors are unavailable.

## 15. Accessibility
Meaningful headings and descriptions identify empty states. Skeletons expose busy/loading semantics with a screen-reader status. Alerts use `role="alert"`; retry controls are semantic buttons with visible focus styles. No status relies on color alone.

## 16. Existing API integration
No API contracts changed. Existing folder, search, team-folder, trash, and audit operations remain the source of truth.

## 17. Security verification
Authentication, authorization, RBAC, session architecture, backend, database, and token storage were unchanged. Error presentation does not expose JWTs, credentials, headers, secrets, stack traces, SQL, or internal paths.

## 18. Tests executed
- `npm test`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

## 19. Exact test results
- `npm test`: PASS — 26 passing, 0 failing
- `npm run typecheck`: PASS
- `npm run build`: PASS — all existing routes generated
- `git diff --check`: PASS
## 20. Production build verification
The optimized production build completed successfully.

## 21. Git verification
Git status, diff, diff stat, and whitespace checks were inspected. Existing unrelated changes were preserved.

## 22. Remaining limitations
No component-rendering test framework is configured, so reusable feedback behavior is covered by pure logic tests plus typecheck/build verification. Browser visual verification was not performed because Playwright/Chromium installation is prohibited. The repository does not provide authoritative error/status color tokens, so existing semantic fallback styles are used.

## 23. Explicit out-of-scope confirmation
UI-207, UI-208, T025, T031, and T032 were not implemented or modified. UI-201 through UI-205 were consumed and not reimplemented.

## 24. Next task
Proceed to UI-207 only after review and explicit approval.
