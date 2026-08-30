# Quickstart: File Preview UI

**Feature**: File Preview UI
**Branch**: `002-file-preview-ui`

Do **not** run this during Spec Kit discovery. Do **not** start Docker or MinIO.

## Preconditions (Phase 05)

- MySQL Windows service `MySQL84`, database `workdrive_dev`, migrations applied, seed present.
- `backend/.env`: `STORAGE_DRIVER=local`, `JWT_SECRET`, `DATABASE_URL`.
- Backend: `node dist/src/main.js` after `npm run build` in `backend`.
- Frontend: existing Playwright webServer / `next dev` as in `frontend/e2e`.

## Unit Tests

```bash
cd frontend
npm test -- src/components/file-preview/  # when created
```

Expect: MIME type detection, preview toolbar logic, language detection tests pass.

## E2E Tests (Playwright)

```bash
cd frontend
npx playwright test e2e/file-preview.spec.ts
```

Test scenarios:
1. Admin opens PDF preview → page nav, zoom, search work
2. Admin opens image preview → zoom, pan, rotate work
3. Admin opens video preview → play, seek, volume work
4. Admin opens text file preview → syntax highlighting, line numbers
5. VIEWER role opens preview → read-only (no download button in toolbar?)
6. Non-member same-org → 404 when attempting preview
7. Cross-tenant → 404
8. Keyboard navigation: Escape closes, arrows navigate versions
9. Arabic RTL: preview toolbar, labels render RTL

## Regression (must stay green)

```bash
cd backend
npm run test:e2e -- --testPathPatterns=idor.live.integration.e2e-spec.ts
# Expect 18/18

npm run test:e2e -- --testPathPatterns=team-folder-acl.live.integration.e2e-spec.ts
# Expect 28/28

cd frontend
npm run test:e2e:browser:gate
# Expect 11/11 (10 My Folders + 1 Team Folder)
```

## Manual Smoke (optional)

1. Inject org admin token into `localStorage.workdrive_access_token` (existing E2E pattern).
2. Upload a PDF, image, video, and text file.
3. Click each file row → "Preview" action → verify preview opens in modal.
4. Test PDF: page next/prev, zoom in/out, text search.
5. Test image: zoom wheel, drag pan, rotate button.
6. Test video: play, seek, volume, fullscreen.
7. Test text: syntax colors, line numbers, long file scrolling.
8. Switch locale to Arabic → verify RTL layout.
9. Open preview with second MEMBER token (no Team Folder membership) → must not see file/preview.

## Direct Link Test (if preview route implemented)

1. Get preview URL from dev tools network tab when opening preview.
2. Open in new incognito window with valid token → should work.
3. Open without token → should redirect to auth.
4. Open with expired token → should show auth error.