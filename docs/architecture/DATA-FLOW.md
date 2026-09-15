# Data Flow

## Upload Data Flow
1. Client requests upload URL (or uploads chunks directly to API).
2. API validates permissions and quota.
3. File blob is written to Object Storage.
4. On success, API inserts metadata into MySQL `files` and `file_versions` tables.
5. API logs event to `audit_logs`.
6. Client is notified of success.

## Download Data Flow
1. Client requests file download by ID.
2. API validates read permissions.
3. API retrieves Object Storage URL (generates signed URL).
4. API logs download event.
5. Client downloads blob directly from Object Storage using the signed URL.
