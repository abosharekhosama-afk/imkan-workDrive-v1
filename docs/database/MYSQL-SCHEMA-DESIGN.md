# MySQL 8.x Technical Schema Design

## Core Tables
### `organizations`
- `id` (PK, UUID), `name`, `created_at`
- Tenant scope root.

### `users`
- `id` (PK, UUID), `org_id` (FK), `email`, `role` (Admin, Member).
- Unique: `(org_id, email)`.

### `team_folders`
- `id` (PK, UUID), `org_id` (FK), `name`, `is_public_to_org`.

### `team_folder_members`
- `team_folder_id` (FK), `user_id` (FK), `role` (Admin, Organizer, Editor, Viewer).
- PK: `(team_folder_id, user_id)`.

### `folders`
- `id` (PK, UUID), `org_id` (FK), `team_folder_id` (FK, Nullable), `parent_id` (FK, Nullable), `name`, `owner_id` (FK).
- Indexes: `(org_id, parent_id)`, `(org_id, team_folder_id)`.

### `files`
- `id` (PK, UUID), `org_id` (FK), `folder_id` (FK, Nullable), `name`, `owner_id` (FK), `deleted_at`.

### `file_versions`
- `id` (PK, UUID), `file_id` (FK), `version_number`, `s3_key`, `size`, `mime_type`, `sha256_hash`, `uploaded_by` (FK).

### `shares`
- `id` (PK, UUID), `resource_type` (File/Folder), `resource_id` (UUID), `link_token` (Unique), `password_hash`, `expires_at`, `can_download`.

### `audit_logs`
- `id` (PK), `org_id`, `actor_id`, `action`, `resource_type`, `resource_id`, `ip_address`, `created_at`.
