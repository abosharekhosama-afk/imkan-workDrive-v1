# Database Migration Plan

## Migration Sequence
1. **001_init_tenants_users**: `organizations`, `users`.
2. **002_team_folders**: `team_folders`, `team_folder_members`.
3. **003_folders_files**: `folders`, `files`, `file_versions`. Includes `org_id` on all tables.
4. **004_shares_audit**: `shares`, `audit_logs`.

## Rollback / Safe Migrations
- All migrations must be forward-only in production.
- Deleting columns is strictly prohibited without two-phase deployment.
