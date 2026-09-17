# Cloud import

The WorkDrive cloud importer uses provider OAuth (no user password is ever collected by WorkDrive) and imports files through a persisted server-side job.

Supported providers:
- Google Drive
- Dropbox
- OneDrive

Required production environment variables:
- `PUBLIC_API_URL`
- `FRONTEND_URL`
- `CLOUD_IMPORT_ENCRYPTION_KEY` — 32 random bytes encoded as hex or base64. Keep it stable; changing it makes stored cloud credentials unreadable and requires reconnecting providers.
- `<PROVIDER>_CLIENT_ID`
- `<PROVIDER>_CLIENT_SECRET`
- `<PROVIDER>_CLOUD_CALLBACK_URL`

Google also accepts the existing `GOOGLE_ID` / `GOOGLE_SECRET` variables as a compatibility fallback.

Register exactly these callback URLs in each provider console:
`{PUBLIC_API_URL}/cloud-import/oauth/google/callback`
`{PUBLIC_API_URL}/cloud-import/oauth/dropbox/callback`
`{PUBLIC_API_URL}/cloud-import/oauth/onedrive/callback`

The importer intentionally does not accept arbitrary remote URLs. Remote files are fetched only through the provider APIs after OAuth authorization. OAuth state is random, single-use, hashed in the database, and expires after ten minutes. Tokens are encrypted at rest with AES-256-GCM.

Imports are persisted as jobs. The browser only polls job status; the server performs the download and storage operation. Therefore a temporary browser/network disconnect does not reset completed progress. Interrupted `IN_PROGRESS` jobs are recovered on backend restart after a safety timeout. Import size is capped at 250 MiB per file and selection is capped at 50 files per request.

Database changes are in the migration `20260917190000_cloud_import`.
