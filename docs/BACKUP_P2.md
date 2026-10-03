# IMKAN Backup & Recovery — Phase 2 (Incremental + Scheduler)

Builds on P1. Dedicated path: `/backup` (not Admin Console).

## New in P2

### Incremental backups
- `POST /backup/runs/incremental`
- Copies only files that:
  - were updated after the last successful run's `snapshotAt`, or
  - were never present in that baseline run
- If no completed baseline exists → automatically runs FULL

### Scheduler
- Policy fields: `scheduleKind` (MANUAL|DAILY|WEEKLY|MONTHLY), `scheduleHourUtc`, `scheduleDay`, `nextRunAt`
- `BackupSchedulerService.processDuePolicies()` starts due jobs (FULL first, then INCREMENTAL)
- **Dedicated worker (recommended in production):**
  ```bash
  npm run backup:worker
  # or: npx ts-node -r tsconfig-paths/register src/backup-worker.ts
  ```
- **Embedded in API process (dev only):**
  ```bash
  BACKUP_SCHEDULER_EMBEDDED=true
  BACKUP_SCHEDULER_INTERVAL_MS=60000
  ```
- Retention: completed runs older than `retentionDays` are deleted (latest completed run always kept)

### API additions
- `POST /backup/runs/incremental`
- `POST /backup/scheduler/tick` (SUPER_ADMIN only — global tick)

### UI (`/backup`)
- Run full / Run incremental
- Schedule daily 02:00 UTC
- Policy cards show `nextRunAt`

## Security (unchanged principles)
- Org isolation on every query
- Org ADMIN gate for org operations
- Scheduler global tick restricted to SUPER_ADMIN
- Audit: BACKUP_RUN_START includes kind
- Backup object keys remain HMAC-prefixed per org

## Deploy
1. Apply P1 migration if not already applied
2. Copy backend `src/backup/*`, `src/backup-worker.ts`, `app.module.ts`
3. Copy frontend `/backup` + `lib/api/backup.ts`
4. Add scripts:
   `"backup:worker": "ts-node -r tsconfig-paths/register src/backup-worker.ts"`
5. Env:
   ```
   BACKUP_ENCRYPTION_KEY=...
   BACKUP_SCHEDULER_EMBEDDED=false
   BACKUP_SCHEDULER_INTERVAL_MS=60000
   ```
6. On Render: add a Background Worker service running `npm run backup:worker`

## Next: P3 — Restore (new location + download archive)
