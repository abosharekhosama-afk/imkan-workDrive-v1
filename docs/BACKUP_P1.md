# IMKAN Backup & Recovery — Phase 1

## Scope
- **Path:** `/backup` (dedicated route — NOT Admin Console)
- **Auth:** Organization `ADMIN` / `SUPER_ADMIN` only
- **Features:** policies, full backup run, run history, snapshot object listing, integrity manifest digest
- **Storage:** copies into backup namespace keys via `copyStoredObject` + metadata index

## Deploy steps
1. Merge `BACKUP_MODELS.prisma.txt` into `backend/prisma/schema.prisma` and org relations snippet.
2. Copy migration folder `20261003180000_backup_core` under `backend/prisma/migrations/`.
3. Copy `backend/src/backup/*` and register `BackupModule` in `app.module.ts` (already shown in provided app.module.ts).
4. Copy frontend `src/app/backup/*` and `src/lib/api/backup.ts`.
5. Set `BACKUP_ENCRYPTION_KEY` (or rely on `CONNECTION_ENCRYPTION_KEY`).
6. Run: `npx prisma migrate deploy && npx prisma generate`
7. Restart backend; open `https://<frontend>/backup`

## Security notes (P1)
- Org isolation on every query (`orgId`)
- Admin role gate on every endpoint
- Audit events: BACKUP_POLICY_*, BACKUP_RUN_START
- Backup keys use HMAC org prefix (non-guessable cross-tenant paths)
- Manifest SHA-256 stored on completed runs
- Live Admin Console routes unchanged

## Next phases
- P2: incremental + scheduler worker
- P3: restore to new location / download archive
- P4: immutable storage / dual control for destructive purge
