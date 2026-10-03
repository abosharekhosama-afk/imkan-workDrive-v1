# IMKAN Backup & Recovery — Phase 4 (Complete)

Path: `/backup` (not Admin Console). Full suite: P1–P4.

## P4 features

### 1. WORM-style immutability
- Completed runs are `locked: true`
- `immutableUntil` set from policy `retentionDays` (null = lock indefinitely)
- Automatic retention **never** hard-deletes locked runs
- Soft-mark `purgedAt` only when unlocked and past retention

### 2. Dual-control purge
Flow:
1. Admin A: `POST /backup/purge-requests` `{ runId, reason }`
2. Admin B (different user): approve or reject
3. Either admin: `POST .../execute` → deletes backup storage objects + marks run purged

Self-approval is rejected.

Audit: `BACKUP_PURGE_REQUEST|APPROVE|REJECT|EXECUTE`

### 3. Large archive packing
- ≤500MB / ≤2000 files → in-memory JSZip
- Larger (up to 5GB) → `archiver` stream path if installed, else batched JSZip
- Optional: `npm i archiver` + `@types/archiver` for better large-archive handling

## Migrations
1. `20261003180000_backup_core`
2. `20261003190000_backup_p4_immutability`

```bash
npx prisma migrate deploy && npx prisma generate
```

## Env
```
BACKUP_ENCRYPTION_KEY=
BACKUP_SCHEDULER_EMBEDDED=false
BACKUP_SCHEDULER_INTERVAL_MS=60000
```

## Worker
```
npm run backup:worker
```

## API surface (complete)
- Policies CRUD
- Runs full / incremental
- Scheduler tick (SUPER_ADMIN)
- Restore NEW_LOCATION | ORIGINAL | DOWNLOAD
- Purge request / approve / reject / execute
