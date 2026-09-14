# IMKAN WorkDrive — Database V2

Status: **implemented and verified** (see [Final verification](#final-verification)).
Generated inspection dump: [`DATABASE-V2-INSPECTION.md`](./DATABASE-V2-INSPECTION.md).
ER diagram: [`DATABASE-V2-ERD.md`](./DATABASE-V2-ERD.md).

---

## 1. Architecture overview

Database V2 turns the V1 "file + s3 key" model into a production-grade
enterprise file management schema:

* **Tenant isolation** — every business table carries `org_id` and is guarded
  at runtime by `PrismaService.$extends` (`TENANT_SCOPED_MODELS`).
* **Logical / physical separation** — `File` (logical) vs `StorageObject`
  (physical bytes in S3/MinIO/local disk). Versions reference storage objects,
  never raw keys.
* **Immutable version history** — `FileVersion` rows are never destroyed when a
  new version is uploaded; older versions become `SUPERSEDED`.
* **Recycle bin as first-class data** — `TrashEntry` records what/who/when/why/
  expiry/restoration instead of relying on `File.deletedAt`.
* **Typed lifecycle state** — native MySQL ENUM columns generated from Prisma
  enums for file status, share permission/status, notification type/priority,
  invitation status, version status, access actions, audit actions, trash
  reasons and storage object status.
* **Split activity trails** — `AuditLog` (security/system) vs `FileActivity`
  (user-facing per-file timeline).

## 2. Entity relationship overview

```
Organization ─┬─ User ─┬─ Session, PasswordResetToken, Notification, Comment…
              │        ├─ Folder (owner) ── File (owner)
              │        └─ TeamFolderMember ── TeamFolder ── Folder
              ├─ Folder (tree via parent_id) ── File
              ├─ File ─┬─ FileVersion ── StorageObject (many-to-one)
              │        ├─ FileMetadata (1:1)
              │        ├─ Comment (threaded), Tag via FileTag
              │        ├─ FileShare ── FileShareRecipient ── User
              │        ├─ FileActivity, TrashEntry
              │        └─ Favorite / AccessEvent (polymorphic resource)
              ├─ AuditLog, OrganizationInvitation, StorageQuota
              └─ Tag, TrashEntry, FileActivity (org scope)
```

Full diagram: [`DATABASE-V2-ERD.md`](./DATABASE-V2-ERD.md).

## 3. Table list

24 application tables (+ Prisma `_prisma_migrations`):

| # | Table | Model |
|---|-------|-------|
| 1 | organizations | Organization |
| 2 | users | User |
| 3 | team_folders | TeamFolder |
| 4 | team_folder_members | TeamFolderMember |
| 5 | folders | Folder |
| 6 | files | File *(upgraded)* |
| 7 | file_metadata | FileMetadata *(new)* |
| 8 | storage_objects | StorageObject *(new)* |
| 9 | file_versions | FileVersion *(upgraded)* |
| 10 | trash_entries | TrashEntry *(new)* |
| 11 | file_shares | FileShare *(renamed from shares, upgraded)* |
| 12 | file_share_recipients | FileShareRecipient *(renamed, upgraded)* |
| 13 | file_activities | FileActivity *(new)* |
| 14 | tags | Tag *(new)* |
| 15 | file_tags | FileTag *(new)* |
| 16 | favorites | Favorite |
| 17 | access_events | AccessEvent *(upgraded)* |
| 18 | audit_logs | AuditLog *(upgraded)* |
| 19 | organization_invitations | OrganizationInvitation *(upgraded)* |
| 20 | sessions | Session |
| 21 | password_reset_tokens | PasswordResetToken |
| 22 | notifications | Notification *(upgraded)* |
| 23 | comments | Comment *(upgraded)* |
| 24 | storage_quotas | StorageQuota |

## 4. Purpose of every table

* **organizations** — tenant root. Everything else hangs off `org_id`.
* **users** — members of one organization; unique `(org_id, email)`.
* **team_folders** — shared workspace containers with ACL flags.
* **team_folder_members** — membership + role (`ADMIN/ORGANIZER/EDITOR/VIEWER`); PK `(team_folder_id, user_id)`.
* **folders** — hierarchical folders (`parent_id` self-FK), optional team folder.
* **files** — *logical* file entity: names, denormalized content facts, lifecycle `status`, `visibility`, soft-delete timestamp.
* **file_metadata** — extracted technical metadata (dimensions, duration, pages…), strict 1:1 with files.
* **storage_objects** — physical objects: bucket + key (+region, checksum, size). One row per distinct uploaded object; may back many versions.
* **file_versions** — immutable point-in-time contents of a file pointing at a StorageObject.
* **trash_entries** — recycle-bin ledger: who deleted what, why, expiry, restoration.
* **file_shares** — sharing grants on one file: direct recipients or public link, permission, optional password/expiry, revocation.
* **file_share_recipients** — direct-share membership `(share_id, user_id)` unique.
* **file_activities** — user-facing per-file timeline.
* **tags / file_tags** — org-scoped labels; M:N attach table with composite PK.
* **favorites** — starred resources per user.
* **access_events** — recent-access tracking per user/resource.
* **audit_logs** — security/system audit trail (actor nullable = system action).
* **organization_invitations** — invite tokens (hash only), role, status, expiry.
* **sessions** — bearer session registry (hash only), revocation, last-seen.
* **password_reset_tokens** — hashed reset tokens.
* **notifications** — inbox entries with type + priority + read state.
* **storage_quotas** — cached quota counters per organization.

## 5. Important columns

* `files.original_name` — immutable upload name; `files.name` is mutable display name.
* `files.mime_type / extension / file_type / size / sha256_hash` — denormalized snapshot of the newest version's content facts (kept in sync by service code).
* `files.status` — ACTIVE/TRASHED/ARCHIVED/PURGED; kept consistent with legacy `deleted_at` (both maintained).
* `files.last_accessed_at` — touched on download URL creation.
* `storage_objects.storage_key` — full tenant key `tenant_{orgId}/files/{fileId}/{versionId}`; unique together with `bucket`.
* `storage_objects.file_id` — **soft owner link**: NULLable, `ON DELETE SET NULL`. Copy/restore share physical objects across files, so the creating file may disappear while others still reference the object.
* `file_versions.version_number` — monotonic per file, unique `(file_id, version_number)`; highest `ACTIVE`/`RESTORED` row = current version.
* `file_versions.uploaded_by` — column name retained from V1 (mapped field `uploadedById`).
* `trash_entries.expires_at` — retention deadline (service default: now + 30 days).
* `file_shares.link_token` — public token, unique; secrets are stored as hashes only (`password_hash`).
* `notifications.type / priority` — enums; `read_at` drives unread counts.
* `comments.deleted_at / edited_at` — soft delete + edit marker.
* `audit_logs.metadata` — JSON context bag; `action` remains free-form string (see §6 note).
* `storage_quotas.used_bytes / quota_bytes` — BigInt counters incremented on upload completion (never recomputed from scratch per request).

## 6. Enum definitions

| Enum | Values | Used by |
|------|--------|---------|
| OrgRole | ADMIN, MEMBER | users.role, invitations.role |
| TeamFolderRole | ADMIN, ORGANIZER, EDITOR, VIEWER | team_folder_members.role |
| ResourceType | FILE, FOLDER | favorites, access_events, notifications.resource_type |
| FileStatus | ACTIVE, TRASHED, ARCHIVED, PURGED | files.status |
| FileType | DOCUMENT, SPREADSHEET, PRESENTATION, PDF, IMAGE, VIDEO, AUDIO, ARCHIVE, TEXT, CODE, OTHER | files.file_type |
| FileVisibility | PRIVATE, ORGANIZATION, TEAM, SHARED, PUBLIC_LINK | files.visibility |
| SharePermission | VIEW, COMMENT, EDIT, ORGANIZE, FULL_ACCESS | file_shares.permission |
| ShareStatus | ACTIVE, EXPIRED, REVOKED | file_shares.status |
| InvitationStatus | PENDING, ACCEPTED, REVOKED, EXPIRED | organization_invitations.status |
| NotificationType | SHARE, COMMENT, MENTION, INVITATION, FILE_UPLOADED, FILE_UPDATED, FILE_DELETED, FILE_RESTORED, VERSION_CREATED, VERSION_RESTORED, ACCESS_REQUEST, SYSTEM | notifications.type |
| NotificationPriority | LOW, NORMAL, HIGH, URGENT | notifications.priority |
| AuditAction | CREATE … CHANGE_PERMISSION (19 values) | file_activities.action |
| TrashReason | USER_DELETED, OWNER_DELETED, PARENT_DELETED, ADMIN_DELETED | trash_entries.reason |
| VersionStatus | ACTIVE, RESTORED, SUPERSEDED, DELETED | file_versions.status |
| AccessAction | VIEW, PREVIEW, DOWNLOAD, EDIT, COMMENT, SHARE, MOVE, COPY, DELETE, RESTORE | access_events.action |
| StorageObjectStatus | ACTIVE, DELETED, CORRUPTED | storage_objects.status |

Deliberately **not** enum-typed (dynamic values): mime types, extensions, file
names, storage keys, SHA-256 hashes, IP addresses, user agents, comment bodies,
free-form JSON metadata, `audit_logs.action` (V1 domain literals such as
`FILE_UPLOAD_COMPLETE` are richer than the generic AuditAction set; converting
would break existing writes and lose granularity).

## 7. Foreign keys

All FKs use `ON UPDATE CASCADE`. Delete rules:

* CASCADE → children die with parent:
  * files → comments, file_metadata, storage_objects? **no** (SET NULL), file_activities, file_tags, trash_entries(file), file_shares, file_versions (via file), tags? (via file_tags both sides cascade)
  * file_shares → file_share_recipients
  * users → sessions, password_reset_tokens, notifications, comments, share recipients
  * folders → folders (self-tree)
* SET NULL → keep the row, drop the link:
  * files → storage_objects.file_id (soft owner)
  * folders → trash_entries.folder_id
  * users → audit_logs.actor_id, file_activities.user_id, trash_entries.restored_by_id
* RESTRICT → block deletion:
  * organizations ← almost everything (tenant integrity)
  * users ← files.owner, folder.owner, file_versions.uploaded_by, trash_entries.deleted_by, file_shares.created_by

Authoritative dump with every constraint: `DATABASE-V2-INSPECTION.md`.

## 8. Index strategy

* Tenant-first composites everywhere: `(org_id, …)` prefixes match the tenant-scope guard injected into every query.
* File browsing: `(org_id, folder_id)`, `(org_id, status)`, `(org_id, file_type)`, `(org_id, owner_id)` + FULLTEXT `(name)`.
* Version lookups: unique `(file_id, version_number)`, `(org_id, sha256_hash)` dedupe/dedup-by-hash, `(org_id, status)` current-version scans.
* Storage: unique `(bucket, storage_key)`, `(org_id, file_id)`, `(org_id, status)`.
* Trash GC sweeps: `(org_id, expires_at)`, `(org_id, deleted_at)`.
* Shares: `(org_id, file_id)`, `(org_id, status)`, `(org_id, created_by_id)`, unique `link_token`, unique `(share_id, user_id)`.
* Inbox: `(org_id, user_id, read_at, created_at)` matches list + unread-count queries exactly.
* Timeline: `(org_id, file_id, created_at)`, `(org_id, user_id, created_at)`, `(org_id, action, created_at)`.
* Access history: `(org_id, user_id, accessed_at)`, `(org_id, resource_type, resource_id, accessed_at)`.
* Audit: `(org_id, created_at)`, `(org_id, actor_id, created_at)`.

## 9. File lifecycle

1. `POST /files/upload-request` → transaction inserts **File** (`status=ACTIVE`,
   denormalized content fields), **StorageObject** (key built from
   fileId/versionId), **FileVersion v1** (`ACTIVE`) and a `CREATE` FileActivity;
   returns presigned PUT URL.
2. Client uploads bytes, then `POST /files/upload-complete` verifies physical
   existence, bumps `storage_quotas.used_bytes`, syncs File content facts and
   records an `UPLOAD_VERSION` activity + `FILE_UPLOAD_COMPLETE` audit entry.
3. Download URLs touch `last_accessed_at`, write `DOWNLOAD` activities and
   `FILE_DOWNLOAD` audit logs.
4. Move/copy/rename emit MOVE/COPY/UPDATE activities; copies reference the same
   StorageObject (no byte duplication).
5. Deletion routes through §11 (trash); purge removes DB rows and, safely, the
   physical bytes (§15).

## 10. Version lifecycle

* Upload of version N marks all older `ACTIVE` versions `SUPERSEDED`; the new
  version is `ACTIVE` (or `RESTORED` when produced by restore).
* Restoring old version V creates a **new** copy-forward version N+1 referencing
  V's StorageObject, flagged `RESTORED`; previous current becomes `SUPERSEDED`.
  History is never destroyed — no rows are rewritten or removed on restore.
* Any historical version can be downloaded directly (`GET /files/:id/versions/:n/download`).
* Permanent delete flags nothing — rows are removed with their file; `DELETED`
  status exists for soft workflows/future GC jobs.
* Current/active version identification = max `version_number` among non-superseded rows.

## 11. Trash lifecycle

* Trash: sets `files.status='TRASHED'` **and** `deleted_at`, then inserts a
  `TrashEntry {deleted_by, reason, deleted_at, expires_at=+30d}`.
* Restore: clears `deleted_at`, resets `status='ACTIVE'`, stamps the open entry
  with `restored_at` / `restored_by_id`.
* Purge (single or empty-trash): deletes unreferenced physical bytes, deletes
  the file row; `TrashEntry` rows cascade away (the audit log persists).
* Retention enforcement (auto-purging expired entries) is a scheduled-job concern and is intentionally not implemented in this phase.

## 12. Sharing lifecycle

* Create: `FileShare {permission, status=ACTIVE, link_token, password_hash?, expires_at?, can_download}`
  plus zero-or-more `FileShareRecipient` rows. V2 sharing is file-scoped
  (`resource_type=FOLDER` requests are rejected with 400).
* Permission change updates the share-level `permission` (VIEW/COMMENT/EDIT/
  ORGANIZE/FULL_ACCESS) — one grant per share.
* Revoke is soft: `status='REVOKED'`, `revoked_at` stamped; the row survives
  for history. Expired links are lazily flipped to `EXPIRED` on verification.
* Public verification requires `status=ACTIVE`, unexpired, password match.
* Removing a recipient deletes its membership row only.

## 13. Notification lifecycle

* Created by domain events (share/comment/etc.) with `NotificationType` +
  `NotificationPriority`; `read_at=NULL` until read.
* Read: single or bulk `updateMany … readAt=now()`; unread count =
  `count(read_at IS NULL)`, served by the composite index.
* No hard delete policy yet (documented limitation §19).

## 14. Audit vs Activity

| | AuditLog | FileActivity |
|---|---|---|
| Audience | security/compliance | end users (file timeline) |
| Granularity | domain-specific string actions (`FILE_TRASHED`, `ORG_INVITATION_ACCEPTED`, …) | generic `AuditAction` enum |
| Actor | nullable (`actor_id` = system) | nullable user |
| Extras | ip_address, JSON metadata, resource coordinates | JSON metadata tied to one file |
| Retention | long-lived, org-scoped | cascades with the file |

They are written side-by-side where both audiences care (e.g. trashing a file
writes `FILE_TRASHED` audit + `DELETE` activity).

## 15. Storage architecture

* Keys are deterministic: `tenant_{orgId}/files/{fileId}/{versionId}`.
* Adapters: S3-compatible (MinIO/AWS) and local-disk; both implement
  `deleteStoredObject(storageKey)` added in V2 so purges can target the exact
  physical object even when it was created under another file id.
* Reference counting: a StorageObject is physically deleted only when **no
  other file_version row references it**; otherwise the row survives with
  `file_id=NULL` (soft owner) while remaining versions keep working.
* Quota accounting happens once per completed upload (incremental), not by
  re-scanning storage.

## 16. Data retention

* Trash entries expire after 30 days (`expires_at`) — sweep job pending (§19).
* Sessions/password-reset tokens carry absolute `expires_at`; expired sessions
  fail validation in the auth guard.
* Audit logs and notifications currently have no automatic TTL.

## 17. Migration history

Forward-only; no resets, no edits to pre-existing migrations:

1..12 — V1 baseline (`001_init_tenants_users` … `add_user_profile_fields`)
13. `20260825090000_database_v2_file_management` — the V2 upgrade:
    new tables (file_metadata, storage_objects, trash_entries, file_activities,
    tags, file_tags), backfilled `storage_objects` from `file_versions.s3_key`
    (deduplicated, deterministic ids) before dropping `s3_key`, renamed
    `shares→file_shares` & `share_recipients→file_share_recipients` via
    RENAME TABLE (rows preserved) then reshaped in place, denormalized file
    content fields backfilled from latest versions, enum conversions for
    notifications/access events, materialized invitation status. Guard rows
    abort the migration if unexpected legacy data would be lost.
14. `20260825091500_storage_object_soft_owner` — makes
    `storage_objects.file_id` nullable with `ON DELETE SET NULL` to support
    shared physical objects outliving their creating file.

Verified equivalent to the target schema via
`prisma migrate diff --from-migrations --to-schema-datamodel` (empty diff).

## 18. Backward compatibility

* API responses keep V1 shapes; new fields are additive (`originalName`,
  `extension`, `fileType`, `size`, `status`, `visibility`, `lastAccessedAt`).
* `File.deletedAt` still works for trash queries; `status` mirrors it.
* `FileVersion.uploadedById` maps to the unchanged `uploaded_by` column.
* Breaking (schema-required): `prisma.share` → `prisma.fileShare`,
  recipient-level `permission` moved to the share, `s3_key` replaced by
  `storageObjectId`, folder sharing rejected, `AccessEvent.action` and
  `Notification.type` are now enums. All call sites were updated in this change.
* BigInt JSON serialization shim installed globally
  (`src/common/bigint-serialization.ts`).

## 19. Known limitations

* Trash auto-purge after `expires_at` needs a scheduled job.
* `InvitationStatus.EXPIRED` is applied lazily (queries still compare
  `expires_at > now`); no sweeper flips stale PENDING rows.
* Sharing is file-only; folder/team-folder sharing was dropped from the API in
  V2 (legacy polymorphic shares could not satisfy the typed file relation).
* Physical-byte cleanup is best-effort reference counting without locking;
  concurrent purge + copy could theoretically race (dev-grade risk assessment).
* Seed data references a StorageObject row but does not create real bytes —
  seeded files cannot be downloaded until uploaded through the real flow.
* `audit_logs.action` remains a free-form string by design.
* Full-text search relies on MySQL natural-language mode with its default
  stopword/min-word behavior.

## Final verification

| Check | Result |
|---|---|
| `npx prisma validate` | PASS |
| `npx prisma migrate status` | up to date (14 migrations) |
| `npx prisma generate` | PASS (client v6.19.3) |
| `npm run build` | PASS |
| `npm test` (unit) | 26 suites / 175 tests PASS |
| `npx jest -c test/jest-e2e.json` (integration incl. 20-step V2 lifecycle) | 5 suites / 68 tests PASS |
| `db:seed` | PASS |
