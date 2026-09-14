# Quickstart: Version History UI

**Feature**: Version History UI
**Branch**: `003-version-history-ui`

Do **not** run this during Spec Kit discovery. Do **not** start Docker or MinIO.

## Preconditions (Phase 05 + File Preview 002)

- MySQL Windows service `MySQL84`, database `workdrive_dev`, migrations applied, seed present.
- `backend/.env`: `STORAGE_DRIVER=local`, `JWT_SECRET`, `DATABASE_URL`.
- Backend: `node dist/src/main.js` after `npm run build` in `backend`.
- Frontend: existing Playwright webServer / `next dev` as in `frontend/e2e`.
- File Preview UI (002) implemented and working.

## Backend Unit Tests

```bash
cd backend
npm test -- src/files/files.service.spec.ts  # version download/restore logic
npm test -- src/files/files.version.spec.ts  # if created
```

## Frontend Unit Tests

```bash
cd frontend
npm test -- src/components/version-history/  # when created
```

## E2E Tests (Playwright)

```bash
cd frontend
npx playwright test e2e/version-history.spec.ts
```

Test scenarios:
1. Admin opens version history for file with 5 versions → sees all versions with metadata
2. Admin clicks "Preview" on version 3 → File Preview opens with version 3 content
3. Admin clicks "Restore" on version 2 → confirmation modal → confirm → new version 6 created
4. VIEWER opens version history → can preview versions, restore button disabled/hidden
5. Non-member same-org → 404 when attempting version history
6. Cross-tenant → 404
7. Keyboard navigation: Escape closes panel, Tab through versions, Enter previews
8. Arabic RTL: version list, metadata, modals render RTL
9. Restore audit log: `FILE_VERSION_RESTORED` event appears in Activity

## Regression (must stay green)

```bash
cd backend
npm run test:e2e -- --testPathPatterns=idor.live.integration.e2e-spec.ts
# Expect 18/18

npm run test:e2e -- --testPathPatterns=team-folder-acl.live.integration.e2e-spec.ts
# Expect 28/28

cd frontend
npm run test:e2e:browser:gate
# Expect 11+ pass (includes File Preview tests)
```

## Manual Smoke (optional)

1. Inject org admin token into `localStorage.workdrive_access_token`.
2. Upload a text file → edit/upload new version 3 times (now v4).
3. Click file row → "Version History" action → panel opens.
4. Verify list shows v4 (current), v3, v2, v1 with uploader, date, size, hash.
5. Click "Preview" on v2 → preview opens with v2 content (verify different from current).
6. Close preview → back to version history panel.
7. Click "Restore" on v1 → confirm modal shows "Restore version 1 as new current version?"
8. Confirm → toast "Version restored" → file list shows updated timestamp.
9. Reopen version history → now shows v5 (restored v1), v4, v3, v2, v1.
10. Check Activity → `FILE_VERSION_RESTORED` event present.
11. Switch to Arabic → verify RTL layout for panel, dates, metadata.
12. Switch to VIEWER token → open history → preview works, restore disabled.
13. Switch to non-member token → attempt history → 404.