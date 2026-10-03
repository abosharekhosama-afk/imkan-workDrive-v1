# IMKAN Backup & Recovery — Phase 3 (Restore + Download)

Dedicated path: `/backup` (not Admin Console). Builds on P1+P2.

## Restore modes

| Mode | Behavior |
|------|----------|
| **NEW_LOCATION** (default, safest) | Creates a folder `Restore <runId>…` and rebuilds relative paths under it |
| **ORIGINAL** | Places files under original parent folder when it still exists; renames on conflict (`(restored …)`) |
| **DOWNLOAD** | Builds ZIP (≤500MB in-memory), stores temp object, returns short-lived signed URL |

## API

```
POST /backup/restore
  { runId, mode?, objectIds?, targetFolderId? }

GET  /backup/restore-jobs
GET  /backup/restore-jobs/:id
```

- Empty `objectIds` → entire snapshot (FILE objects)
- Max 2000 selected objects
- One active restore per org at a time
- Audit: `BACKUP_RESTORE_START`, `BACKUP_RESTORE_COMPLETE`, `BACKUP_RESTORE_DOWNLOAD`

## Security

- Org admin only
- All queries scoped by `orgId`
- Physical bytes copied via `copyStoredObject` from backup keys (not live keys alone)
- Download links are short-lived signed URLs
- NEW_LOCATION never overwrites live paths by default
- Name conflicts always renamed instead of overwrite

## UI (`/backup`)

1. Select a completed run → snapshot table
2. Optional multi-select
3. Restore to new folder / near original / Download ZIP
4. Restore jobs list with download link when ready

## Deploy

Same as P2 package + overwrite:
- `backend/src/backup/backup.service.ts` (restore methods)
- `backend/src/backup/backup.controller.ts`
- `frontend/src/app/backup/page.tsx`
- `frontend/src/lib/api/backup.ts`

Requires `jszip` (already in project dependencies).

## Next (P4)

- Immutable / WORM backup storage
- Dual-control for destructive purge of backup runs
- Streaming zip for archives > 500MB
