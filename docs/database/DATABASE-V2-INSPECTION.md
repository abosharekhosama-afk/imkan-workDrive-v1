# workdrive_dev inspection (2026-08-25T10:25:05.861Z)

TABLE COUNT: 25

## _prisma_migrations

| column | type | nullable | default | key | extra |
| --- | --- | --- | --- | --- | --- |
| id | varchar(36) | NO | - | PRI |  |
| checksum | varchar(64) | NO | - |  |  |
| finished_at | datetime(3) | YES | - |  |  |
| migration_name | varchar(255) | NO | - |  |  |
| logs | text | YES | - |  |  |
| rolled_back_at | datetime(3) | YES | - |  |  |
| started_at | datetime(3) | NO | CURRENT_TIMESTAMP(3) |  | DEFAULT_GENERATED |
| applied_steps_count | int unsigned | NO | 0 |  |  |
- PRIMARY KEY: (id)

## access_events

| column | type | nullable | default | key | extra |
| --- | --- | --- | --- | --- | --- |
| id | char(36) | NO | - | PRI |  |
| org_id | char(36) | NO | - | MUL |  |
| user_id | char(36) | NO | - | MUL |  |
| resource_type | enum('FILE','FOLDER') | NO | - |  |  |
| resource_id | char(36) | NO | - |  |  |
| action | enum('VIEW','PREVIEW','DOWNLOAD','EDIT','COMMENT','SHARE','MOVE','COPY','DELETE','RESTORE') | NO | - |  |  |
| accessed_at | datetime(3) | NO | CURRENT_TIMESTAMP(3) |  | DEFAULT_GENERATED |
- PRIMARY KEY: (id)
- FK access_events.org_id -> organizations.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- FK access_events.user_id -> users.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- INDEX access_events_org_id_resource_type_resource_id_accessed_at_idx: (org_id, resource_type, resource_id, accessed_at)
- INDEX access_events_org_id_user_id_accessed_at_idx: (org_id, user_id, accessed_at)
- INDEX access_events_user_id_fkey: (user_id)

## audit_logs

| column | type | nullable | default | key | extra |
| --- | --- | --- | --- | --- | --- |
| id | char(36) | NO | - | PRI |  |
| org_id | char(36) | NO | - | MUL |  |
| actor_id | char(36) | YES | - | MUL |  |
| action | varchar(191) | NO | - |  |  |
| resource_type | varchar(191) | NO | - |  |  |
| resource_id | char(36) | NO | - |  |  |
| ip_address | varchar(191) | YES | - |  |  |
| created_at | datetime(3) | NO | CURRENT_TIMESTAMP(3) |  | DEFAULT_GENERATED |
| metadata | json | YES | - |  |  |
- PRIMARY KEY: (id)
- FK audit_logs.actor_id -> users.id (ON DELETE SET NULL, ON UPDATE CASCADE)
- FK audit_logs.org_id -> organizations.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- INDEX audit_logs_actor_id_fkey: (actor_id)
- INDEX audit_logs_org_id_actor_id_created_at_idx: (org_id, actor_id, created_at)
- INDEX audit_logs_org_id_created_at_idx: (org_id, created_at)

## comments

| column | type | nullable | default | key | extra |
| --- | --- | --- | --- | --- | --- |
| id | char(36) | NO | - | PRI |  |
| org_id | char(36) | NO | - | MUL |  |
| file_id | char(36) | NO | - | MUL |  |
| user_id | char(36) | NO | - | MUL |  |
| parent_id | char(36) | YES | - | MUL |  |
| body | text | NO | - |  |  |
| created_at | datetime(3) | NO | CURRENT_TIMESTAMP(3) |  | DEFAULT_GENERATED |
| updated_at | datetime(3) | NO | - |  |  |
| deleted_at | datetime(3) | YES | - |  |  |
| edited_at | datetime(3) | YES | - |  |  |
- PRIMARY KEY: (id)
- FK comments.file_id -> files.id (ON DELETE CASCADE, ON UPDATE CASCADE)
- FK comments.org_id -> organizations.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- FK comments.parent_id -> comments.id (ON DELETE CASCADE, ON UPDATE CASCADE)
- FK comments.user_id -> users.id (ON DELETE CASCADE, ON UPDATE CASCADE)
- INDEX comments_file_id_fkey: (file_id)
- INDEX comments_org_id_file_id_created_at_idx: (org_id, file_id, created_at)
- INDEX comments_parent_id_fkey: (parent_id)
- INDEX comments_user_id_idx: (user_id)

## favorites

| column | type | nullable | default | key | extra |
| --- | --- | --- | --- | --- | --- |
| id | char(36) | NO | - | PRI |  |
| org_id | char(36) | NO | - | MUL |  |
| user_id | char(36) | NO | - | MUL |  |
| resource_type | enum('FILE','FOLDER') | NO | - |  |  |
| resource_id | char(36) | NO | - |  |  |
| created_at | datetime(3) | NO | CURRENT_TIMESTAMP(3) |  | DEFAULT_GENERATED |
- PRIMARY KEY: (id)
- FK favorites.org_id -> organizations.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- FK favorites.user_id -> users.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- INDEX favorites_org_id_user_id_idx: (org_id, user_id)
- UNIQUE favorites_user_id_resource_type_resource_id_key: (user_id, resource_type, resource_id)

## file_activities

| column | type | nullable | default | key | extra |
| --- | --- | --- | --- | --- | --- |
| id | char(36) | NO | - | PRI |  |
| org_id | char(36) | NO | - | MUL |  |
| file_id | char(36) | NO | - | MUL |  |
| user_id | char(36) | YES | - | MUL |  |
| action | enum('CREATE','UPDATE','DELETE','RESTORE','MOVE','COPY','DOWNLOAD','PREVIEW','SHARE','UNSHARE','COMMENT','UPLOAD_VERSION','RESTORE_VERSION','LOGIN','LOGOUT','INVITE','ACCEPT_INVITATION','REVOKE_INVITATION','CHANGE_PERMISSION') | NO | - |  |  |
| metadata | json | YES | - |  |  |
| created_at | datetime(3) | NO | CURRENT_TIMESTAMP(3) |  | DEFAULT_GENERATED |
- PRIMARY KEY: (id)
- FK file_activities.file_id -> files.id (ON DELETE CASCADE, ON UPDATE CASCADE)
- FK file_activities.org_id -> organizations.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- FK file_activities.user_id -> users.id (ON DELETE SET NULL, ON UPDATE CASCADE)
- INDEX file_activities_file_id_fkey: (file_id)
- INDEX file_activities_org_id_action_created_at_idx: (org_id, action, created_at)
- INDEX file_activities_org_id_file_id_created_at_idx: (org_id, file_id, created_at)
- INDEX file_activities_org_id_user_id_created_at_idx: (org_id, user_id, created_at)
- INDEX file_activities_user_id_fkey: (user_id)

## file_metadata

| column | type | nullable | default | key | extra |
| --- | --- | --- | --- | --- | --- |
| id | char(36) | NO | - | PRI |  |
| file_id | char(36) | NO | - | UNI |  |
| width | int | YES | - |  |  |
| height | int | YES | - |  |  |
| duration | int | YES | - |  |  |
| page_count | int | YES | - |  |  |
| encoding | varchar(191) | YES | - |  |  |
| language | varchar(191) | YES | - |  |  |
| title | varchar(191) | YES | - |  |  |
| description | text | YES | - |  |  |
| created_at | datetime(3) | NO | CURRENT_TIMESTAMP(3) |  | DEFAULT_GENERATED |
| updated_at | datetime(3) | NO | - |  |  |
- PRIMARY KEY: (id)
- FK file_metadata.file_id -> files.id (ON DELETE CASCADE, ON UPDATE CASCADE)
- UNIQUE file_metadata_file_id_key: (file_id)

## file_share_recipients

| column | type | nullable | default | key | extra |
| --- | --- | --- | --- | --- | --- |
| id | char(36) | NO | - | PRI |  |
| org_id | char(36) | NO | - | MUL |  |
| share_id | char(36) | NO | - | MUL |  |
| user_id | char(36) | NO | - | MUL |  |
| created_at | datetime(3) | NO | CURRENT_TIMESTAMP(3) |  | DEFAULT_GENERATED |
- PRIMARY KEY: (id)
- FK file_share_recipients.org_id -> organizations.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- FK file_share_recipients.share_id -> file_shares.id (ON DELETE CASCADE, ON UPDATE CASCADE)
- FK file_share_recipients.user_id -> users.id (ON DELETE CASCADE, ON UPDATE CASCADE)
- INDEX file_share_recipients_org_id_user_id_idx: (org_id, user_id)
- UNIQUE file_share_recipients_share_id_user_id_key: (share_id, user_id)
- INDEX file_share_recipients_user_id_fkey: (user_id)

## file_shares

| column | type | nullable | default | key | extra |
| --- | --- | --- | --- | --- | --- |
| id | char(36) | NO | - | PRI |  |
| org_id | char(36) | NO | - | MUL |  |
| link_token | varchar(191) | NO | - | UNI |  |
| password_hash | varchar(191) | YES | - |  |  |
| expires_at | datetime(3) | YES | - |  |  |
| can_download | tinyint(1) | NO | 1 |  |  |
| file_id | char(36) | NO | - | MUL |  |
| created_by_id | char(36) | NO | - | MUL |  |
| status | enum('ACTIVE','EXPIRED','REVOKED') | NO | ACTIVE |  |  |
| permission | enum('VIEW','COMMENT','EDIT','ORGANIZE','FULL_ACCESS') | NO | VIEW |  |  |
| created_at | datetime(3) | NO | CURRENT_TIMESTAMP(3) |  | DEFAULT_GENERATED |
| revoked_at | datetime(3) | YES | - |  |  |
- PRIMARY KEY: (id)
- FK file_shares.created_by_id -> users.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- FK file_shares.file_id -> files.id (ON DELETE CASCADE, ON UPDATE CASCADE)
- FK file_shares.org_id -> organizations.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- INDEX file_shares_created_by_id_fkey: (created_by_id)
- INDEX file_shares_file_id_fkey: (file_id)
- UNIQUE file_shares_link_token_key: (link_token)
- INDEX file_shares_org_id_created_by_id_idx: (org_id, created_by_id)
- INDEX file_shares_org_id_file_id_idx: (org_id, file_id)
- INDEX file_shares_org_id_status_idx: (org_id, status)

## file_tags

| column | type | nullable | default | key | extra |
| --- | --- | --- | --- | --- | --- |
| file_id | char(36) | NO | - | PRI |  |
| tag_id | char(36) | NO | - | PRI |  |
- PRIMARY KEY: (file_id, tag_id)
- FK file_tags.file_id -> files.id (ON DELETE CASCADE, ON UPDATE CASCADE)
- FK file_tags.tag_id -> tags.id (ON DELETE CASCADE, ON UPDATE CASCADE)
- INDEX file_tags_tag_id_idx: (tag_id)

## file_versions

| column | type | nullable | default | key | extra |
| --- | --- | --- | --- | --- | --- |
| id | char(36) | NO | - | PRI |  |
| org_id | char(36) | NO | - | MUL |  |
| file_id | char(36) | NO | - | MUL |  |
| version_number | int | NO | - |  |  |
| size | bigint | NO | - |  |  |
| mime_type | varchar(191) | NO | - |  |  |
| sha256_hash | char(64) | NO | - |  |  |
| uploaded_by | char(36) | NO | - | MUL |  |
| created_at | datetime(3) | NO | CURRENT_TIMESTAMP(3) |  | DEFAULT_GENERATED |
| extension | varchar(191) | YES | - |  |  |
| status | enum('ACTIVE','RESTORED','SUPERSEDED','DELETED') | NO | ACTIVE |  |  |
| storage_object_id | char(36) | NO | - | MUL |  |
- PRIMARY KEY: (id)
- FK file_versions.file_id -> files.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- FK file_versions.org_id -> organizations.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- FK file_versions.storage_object_id -> storage_objects.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- FK file_versions.uploaded_by -> users.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- UNIQUE file_versions_file_id_version_number_key: (file_id, version_number)
- INDEX file_versions_org_id_sha256_hash_idx: (org_id, sha256_hash)
- INDEX file_versions_org_id_status_idx: (org_id, status)
- INDEX file_versions_storage_object_id_fkey: (storage_object_id)
- INDEX file_versions_uploaded_by_fkey: (uploaded_by)

## files

| column | type | nullable | default | key | extra |
| --- | --- | --- | --- | --- | --- |
| id | char(36) | NO | - | PRI |  |
| org_id | char(36) | NO | - | MUL |  |
| folder_id | char(36) | YES | - | MUL |  |
| name | varchar(191) | NO | - | MUL |  |
| owner_id | char(36) | NO | - | MUL |  |
| deleted_at | datetime(3) | YES | - |  |  |
| updated_at | datetime(3) | NO | - |  | DEFAULT_GENERATED |
| created_at | datetime(3) | NO | CURRENT_TIMESTAMP(3) |  | DEFAULT_GENERATED |
| extension | varchar(191) | YES | - |  |  |
| file_type | enum('DOCUMENT','SPREADSHEET','PRESENTATION','PDF','IMAGE','VIDEO','AUDIO','ARCHIVE','TEXT','CODE','OTHER') | NO | OTHER |  |  |
| last_accessed_at | datetime(3) | YES | - |  |  |
| mime_type | varchar(191) | YES | - |  |  |
| original_name | varchar(191) | NO | - |  |  |
| sha256_hash | char(64) | YES | - |  |  |
| size | bigint | NO | 0 |  |  |
| status | enum('ACTIVE','TRASHED','ARCHIVED','PURGED') | NO | ACTIVE |  |  |
| visibility | enum('PRIVATE','ORGANIZATION','TEAM','SHARED','PUBLIC_LINK') | NO | PRIVATE |  |  |
- PRIMARY KEY: (id)
- FK files.folder_id -> folders.id (ON DELETE SET NULL, ON UPDATE CASCADE)
- FK files.org_id -> organizations.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- FK files.owner_id -> users.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- INDEX files_folder_id_fkey: (folder_id)
- INDEX files_name_idx: (name)
- INDEX files_org_id_file_type_idx: (org_id, file_type)
- INDEX files_org_id_folder_id_idx: (org_id, folder_id)
- INDEX files_org_id_owner_id_idx: (org_id, owner_id)
- INDEX files_org_id_status_idx: (org_id, status)
- INDEX files_owner_id_fkey: (owner_id)

## folders

| column | type | nullable | default | key | extra |
| --- | --- | --- | --- | --- | --- |
| id | char(36) | NO | - | PRI |  |
| org_id | char(36) | NO | - | MUL |  |
| team_folder_id | char(36) | YES | - | MUL |  |
| parent_id | char(36) | YES | - | MUL |  |
| name | varchar(191) | NO | - | MUL |  |
| owner_id | char(36) | NO | - | MUL |  |
| updated_at | datetime(3) | NO | - |  | DEFAULT_GENERATED |
- PRIMARY KEY: (id)
- FK folders.org_id -> organizations.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- FK folders.owner_id -> users.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- FK folders.parent_id -> folders.id (ON DELETE SET NULL, ON UPDATE CASCADE)
- FK folders.team_folder_id -> team_folders.id (ON DELETE SET NULL, ON UPDATE CASCADE)
- INDEX folders_name_idx: (name)
- INDEX folders_org_id_parent_id_idx: (org_id, parent_id)
- INDEX folders_org_id_team_folder_id_idx: (org_id, team_folder_id)
- INDEX folders_owner_id_fkey: (owner_id)
- INDEX folders_parent_id_fkey: (parent_id)
- INDEX folders_team_folder_id_fkey: (team_folder_id)

## notifications

| column | type | nullable | default | key | extra |
| --- | --- | --- | --- | --- | --- |
| id | char(36) | NO | - | PRI |  |
| org_id | char(36) | NO | - | MUL |  |
| user_id | char(36) | NO | - | MUL |  |
| type | enum('SHARE','COMMENT','MENTION','INVITATION','FILE_UPLOADED','FILE_UPDATED','FILE_DELETED','FILE_RESTORED','VERSION_CREATED','VERSION_RESTORED','ACCESS_REQUEST','SYSTEM') | NO | - |  |  |
| title | varchar(191) | NO | - |  |  |
| body | varchar(191) | YES | - |  |  |
| resource_type | enum('FILE','FOLDER') | YES | - |  |  |
| resource_id | char(36) | YES | - |  |  |
| read_at | datetime(3) | YES | - |  |  |
| created_at | datetime(3) | NO | CURRENT_TIMESTAMP(3) |  | DEFAULT_GENERATED |
| priority | enum('LOW','NORMAL','HIGH','URGENT') | NO | NORMAL |  |  |
- PRIMARY KEY: (id)
- FK notifications.org_id -> organizations.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- FK notifications.user_id -> users.id (ON DELETE CASCADE, ON UPDATE CASCADE)
- INDEX notifications_org_id_user_id_read_at_created_at_idx: (org_id, user_id, read_at, created_at)
- INDEX notifications_user_id_fkey: (user_id)

## organization_invitations

| column | type | nullable | default | key | extra |
| --- | --- | --- | --- | --- | --- |
| id | char(36) | NO | - | PRI |  |
| org_id | char(36) | NO | - | MUL |  |
| email | varchar(191) | NO | - |  |  |
| role | enum('ADMIN','MEMBER') | NO | - |  |  |
| token_hash | char(64) | NO | - | UNI |  |
| invited_by_id | char(36) | NO | - | MUL |  |
| expires_at | datetime(3) | NO | - |  |  |
| accepted_at | datetime(3) | YES | - |  |  |
| revoked_at | datetime(3) | YES | - |  |  |
| created_at | datetime(3) | NO | CURRENT_TIMESTAMP(3) |  | DEFAULT_GENERATED |
| status | enum('PENDING','ACCEPTED','REVOKED','EXPIRED') | NO | PENDING |  |  |
- PRIMARY KEY: (id)
- FK organization_invitations.invited_by_id -> users.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- FK organization_invitations.org_id -> organizations.id (ON DELETE CASCADE, ON UPDATE CASCADE)
- INDEX organization_invitations_invited_by_id_fkey: (invited_by_id)
- INDEX organization_invitations_org_id_email_accepted_at_revoked_at_idx: (org_id, email, accepted_at, revoked_at)
- INDEX organization_invitations_org_id_status_idx: (org_id, status)
- UNIQUE organization_invitations_token_hash_key: (token_hash)

## organizations

| column | type | nullable | default | key | extra |
| --- | --- | --- | --- | --- | --- |
| id | char(36) | NO | - | PRI |  |
| name | varchar(191) | NO | - |  |  |
| created_at | datetime(3) | NO | CURRENT_TIMESTAMP(3) |  | DEFAULT_GENERATED |
- PRIMARY KEY: (id)

## password_reset_tokens

| column | type | nullable | default | key | extra |
| --- | --- | --- | --- | --- | --- |
| id | char(36) | NO | - | PRI |  |
| user_id | char(36) | NO | - | MUL |  |
| token_hash | char(64) | NO | - | UNI |  |
| expires_at | datetime(3) | NO | - |  |  |
| used_at | datetime(3) | YES | - |  |  |
| created_at | datetime(3) | NO | CURRENT_TIMESTAMP(3) |  | DEFAULT_GENERATED |
- PRIMARY KEY: (id)
- FK password_reset_tokens.user_id -> users.id (ON DELETE CASCADE, ON UPDATE CASCADE)
- UNIQUE password_reset_tokens_token_hash_key: (token_hash)
- INDEX password_reset_tokens_user_id_expires_at_idx: (user_id, expires_at)

## sessions

| column | type | nullable | default | key | extra |
| --- | --- | --- | --- | --- | --- |
| id | char(36) | NO | - | PRI |  |
| org_id | char(36) | NO | - | MUL |  |
| user_id | char(36) | NO | - | MUL |  |
| token_hash | char(64) | NO | - |  |  |
| expires_at | datetime(3) | NO | - |  |  |
| revoked_at | datetime(3) | YES | - |  |  |
| created_at | datetime(3) | NO | CURRENT_TIMESTAMP(3) |  | DEFAULT_GENERATED |
| last_seen_at | datetime(3) | NO | CURRENT_TIMESTAMP(3) |  | DEFAULT_GENERATED |
- PRIMARY KEY: (id)
- FK sessions.org_id -> organizations.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- FK sessions.user_id -> users.id (ON DELETE CASCADE, ON UPDATE CASCADE)
- INDEX sessions_org_id_user_id_revoked_at_idx: (org_id, user_id, revoked_at)
- INDEX sessions_user_id_fkey: (user_id)

## storage_objects

| column | type | nullable | default | key | extra |
| --- | --- | --- | --- | --- | --- |
| id | char(36) | NO | - | PRI |  |
| org_id | char(36) | NO | - | MUL |  |
| file_id | char(36) | YES | - | MUL |  |
| storage_key | varchar(191) | NO | - |  |  |
| bucket | varchar(191) | NO | - | MUL |  |
| region | varchar(191) | YES | - |  |  |
| size | bigint | NO | 0 |  |  |
| checksum | varchar(191) | YES | - |  |  |
| status | enum('ACTIVE','DELETED','CORRUPTED') | NO | ACTIVE |  |  |
| created_at | datetime(3) | NO | CURRENT_TIMESTAMP(3) |  | DEFAULT_GENERATED |
- PRIMARY KEY: (id)
- FK storage_objects.file_id -> files.id (ON DELETE SET NULL, ON UPDATE CASCADE)
- FK storage_objects.org_id -> organizations.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- UNIQUE storage_objects_bucket_storage_key_key: (bucket, storage_key)
- INDEX storage_objects_file_id_fkey: (file_id)
- INDEX storage_objects_org_id_file_id_idx: (org_id, file_id)
- INDEX storage_objects_org_id_status_idx: (org_id, status)

## storage_quotas

| column | type | nullable | default | key | extra |
| --- | --- | --- | --- | --- | --- |
| id | char(36) | NO | - | PRI |  |
| org_id | char(36) | NO | - | UNI |  |
| quota_bytes | bigint | NO | - |  |  |
| used_bytes | bigint | NO | 0 |  |  |
| updated_at | datetime(3) | NO | - |  |  |
- PRIMARY KEY: (id)
- FK storage_quotas.org_id -> organizations.id (ON DELETE CASCADE, ON UPDATE CASCADE)
- UNIQUE storage_quotas_org_id_key: (org_id)

## tags

| column | type | nullable | default | key | extra |
| --- | --- | --- | --- | --- | --- |
| id | char(36) | NO | - | PRI |  |
| org_id | char(36) | NO | - | MUL |  |
| name | varchar(191) | NO | - |  |  |
| created_at | datetime(3) | NO | CURRENT_TIMESTAMP(3) |  | DEFAULT_GENERATED |
- PRIMARY KEY: (id)
- FK tags.org_id -> organizations.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- INDEX tags_org_id_idx: (org_id)
- UNIQUE tags_org_id_name_key: (org_id, name)

## team_folder_members

| column | type | nullable | default | key | extra |
| --- | --- | --- | --- | --- | --- |
| team_folder_id | char(36) | NO | - | PRI |  |
| user_id | char(36) | NO | - | PRI |  |
| org_id | char(36) | NO | - | MUL |  |
| role | enum('ADMIN','ORGANIZER','EDITOR','VIEWER') | NO | - |  |  |
- PRIMARY KEY: (team_folder_id, user_id)
- FK team_folder_members.org_id -> organizations.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- FK team_folder_members.team_folder_id -> team_folders.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- FK team_folder_members.user_id -> users.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- INDEX team_folder_members_org_id_idx: (org_id)
- INDEX team_folder_members_user_id_fkey: (user_id)

## team_folders

| column | type | nullable | default | key | extra |
| --- | --- | --- | --- | --- | --- |
| id | char(36) | NO | - | PRI |  |
| org_id | char(36) | NO | - | MUL |  |
| name | varchar(191) | NO | - |  |  |
| is_public_to_org | tinyint(1) | NO | 0 |  |  |
- PRIMARY KEY: (id)
- FK team_folders.org_id -> organizations.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- INDEX team_folders_org_id_idx: (org_id)

## trash_entries

| column | type | nullable | default | key | extra |
| --- | --- | --- | --- | --- | --- |
| id | char(36) | NO | - | PRI |  |
| org_id | char(36) | NO | - | MUL |  |
| file_id | char(36) | YES | - | MUL |  |
| folder_id | char(36) | YES | - | MUL |  |
| deleted_by_id | char(36) | NO | - | MUL |  |
| reason | enum('USER_DELETED','OWNER_DELETED','PARENT_DELETED','ADMIN_DELETED') | NO | USER_DELETED |  |  |
| deleted_at | datetime(3) | NO | CURRENT_TIMESTAMP(3) |  | DEFAULT_GENERATED |
| expires_at | datetime(3) | NO | - |  |  |
| restored_at | datetime(3) | YES | - |  |  |
| restored_by_id | char(36) | YES | - | MUL |  |
- PRIMARY KEY: (id)
- FK trash_entries.deleted_by_id -> users.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- FK trash_entries.file_id -> files.id (ON DELETE CASCADE, ON UPDATE CASCADE)
- FK trash_entries.folder_id -> folders.id (ON DELETE SET NULL, ON UPDATE CASCADE)
- FK trash_entries.org_id -> organizations.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- FK trash_entries.restored_by_id -> users.id (ON DELETE SET NULL, ON UPDATE CASCADE)
- INDEX trash_entries_deleted_by_id_fkey: (deleted_by_id)
- INDEX trash_entries_file_id_idx: (file_id)
- INDEX trash_entries_folder_id_idx: (folder_id)
- INDEX trash_entries_org_id_deleted_at_idx: (org_id, deleted_at)
- INDEX trash_entries_org_id_expires_at_idx: (org_id, expires_at)
- INDEX trash_entries_restored_by_id_fkey: (restored_by_id)

## users

| column | type | nullable | default | key | extra |
| --- | --- | --- | --- | --- | --- |
| id | char(36) | NO | - | PRI |  |
| org_id | char(36) | NO | - | MUL |  |
| email | varchar(191) | NO | - |  |  |
| role | enum('ADMIN','MEMBER') | NO | - |  |  |
| created_at | datetime(3) | NO | CURRENT_TIMESTAMP(3) |  | DEFAULT_GENERATED |
| google_id | varchar(191) | YES | - | UNI |  |
| name | varchar(191) | YES | - |  |  |
| password_hash | varchar(191) | YES | - |  |  |
- PRIMARY KEY: (id)
- FK users.org_id -> organizations.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
- UNIQUE users_google_id_key: (google_id)
- UNIQUE users_org_id_email_key: (org_id, email)
- INDEX users_org_id_idx: (org_id)

## Enum columns

1. access_events.resource_type, favorites.resource_type, notifications.resource_type: ["FILE","FOLDER"]
2. access_events.action: ["VIEW","PREVIEW","DOWNLOAD","EDIT","COMMENT","SHARE","MOVE","COPY","DELETE","RESTORE"]
3. file_activities.action: ["CREATE","UPDATE","DELETE","RESTORE","MOVE","COPY","DOWNLOAD","PREVIEW","SHARE","UNSHARE","COMMENT","UPLOAD_VERSION","RESTORE_VERSION","LOGIN","LOGOUT","INVITE","ACCEPT_INVITATION","REVOKE_INVITATION","CHANGE_PERMISSION"]
4. file_shares.status: ["ACTIVE","EXPIRED","REVOKED"]
5. file_shares.permission: ["VIEW","COMMENT","EDIT","ORGANIZE","FULL_ACCESS"]
6. file_versions.status: ["ACTIVE","RESTORED","SUPERSEDED","DELETED"]
7. files.file_type: ["DOCUMENT","SPREADSHEET","PRESENTATION","PDF","IMAGE","VIDEO","AUDIO","ARCHIVE","TEXT","CODE","OTHER"]
8. files.status: ["ACTIVE","TRASHED","ARCHIVED","PURGED"]
9. files.visibility: ["PRIVATE","ORGANIZATION","TEAM","SHARED","PUBLIC_LINK"]
10. notifications.type: ["SHARE","COMMENT","MENTION","INVITATION","FILE_UPLOADED","FILE_UPDATED","FILE_DELETED","FILE_RESTORED","VERSION_CREATED","VERSION_RESTORED","ACCESS_REQUEST","SYSTEM"]
11. notifications.priority: ["LOW","NORMAL","HIGH","URGENT"]
12. organization_invitations.role, users.role: ["ADMIN","MEMBER"]
13. organization_invitations.status: ["PENDING","ACCEPTED","REVOKED","EXPIRED"]
14. storage_objects.status: ["ACTIVE","DELETED","CORRUPTED"]
15. team_folder_members.role: ["ADMIN","ORGANIZER","EDITOR","VIEWER"]
16. trash_entries.reason: ["USER_DELETED","OWNER_DELETED","PARENT_DELETED","ADMIN_DELETED"]