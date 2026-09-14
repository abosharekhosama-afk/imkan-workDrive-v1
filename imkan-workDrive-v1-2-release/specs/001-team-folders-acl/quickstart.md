# Quickstart (after implementation is authorized)

Do **not** run this during Spec Kit discovery. Do **not** start Docker or MinIO.

## Preconditions (Phase 04)

- MySQL Windows service `MySQL84`, database `workdrive_dev`, migrations applied, seed present.
- `backend/.env`: `STORAGE_DRIVER=local`, `JWT_SECRET`, `DATABASE_URL`.
- Backend: `node dist/src/main.js` after `npm run build` in `backend`.
- Frontend: existing Playwright webServer / `next dev` as in `frontend/e2e`.

## Unit

```bash
cd backend
npm test -- src/permissions/permission.service.spec.ts
```

Expect matrix coverage: personal Phase 04 rules plus Team Folder roles.

## Live ACL (new suite)

```bash
cd backend
npm run test:e2e -- test/team-folder-acl.live.integration.e2e-spec.ts
```

Mint JWTs the same way as `test/idor.live.integration.e2e-spec.ts`. Create same-org users and memberships in the test, then assert 404/403/200 per spec. Clean up rows.

## Regression (must stay green)

```bash
cd backend
npm run test:e2e -- test/idor.live.integration.e2e-spec.ts
```

```bash
cd frontend
npm run test:e2e:browser:gate
```

Expect IDOR 18/18 and Playwright 10/10 plus any new Team Folder Playwright case if added to the gate spec.

## Manual smoke (optional)

1. Inject org admin token into `localStorage.workdrive_access_token` (existing E2E pattern).
2. Create Team Folder in UI.
3. Open as a second MEMBER token without membership — must not see the TF or its files in search.
