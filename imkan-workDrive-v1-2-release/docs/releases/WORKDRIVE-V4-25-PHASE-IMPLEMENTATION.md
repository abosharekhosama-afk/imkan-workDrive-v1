# IMKAN WorkDrive V4 — 25-Phase Implementation Plan & Delivery Status

## Target
Build IMKAN WorkDrive as an enterprise document platform with Zoho WorkDrive as the functional/UX reference and IMKAN One as the visual authority. No fake UI, no fake API, no client-supplied tenant authority.

## Phase sequence

1. Production upload engine — signed uploads, root uploads, queue/progress, validation.
2. Storage abstraction — local/S3-compatible adapters, tenant object keys, signed access, deletion lifecycle.
3. Team-folder permissions — ADMIN/ORGANIZER/EDITOR/VIEWER and server-side enforcement.
4. Folder/file ACL — effective permission calculation and inheritance boundaries.
5. Internal sharing — direct recipients and VIEW/COMMENT/EDIT permissions.
6. External sharing — protected links, password, expiry, download control and revocation foundation.
7. Move/copy — file and recursive folder operations with destination authorization and cycle protection.
8. Trash/recovery — restore, permanent delete and empty-trash operations.
9. Bulk operations — batch move/trash/permanent delete APIs without fake client-side mutation.
10. Version history — version download and restore with immutable version records.
11. Preview — image/PDF/text/media preview through signed backend URLs.
12. Recent/access history — real access events and recent listing.
13. Shared with me/by me — recipient-aware sharing views.
14. Search — tenant-scoped name/content indexing foundation and filter-ready API.
15. Favorites — user-scoped favorite state for files and folders.
16. Notifications — event-driven notification model and inbox.
17. Collaboration — comments, replies, mentions and activity integration.
18. Authentication lifecycle — signup/login/logout/session revocation/password recovery.
19. Google OAuth — real OAuth code flow; MFA intentionally excluded.
20. Admin console — members, folders, sharing, storage, deleted data and audit controls.
21. Storage quotas — organization/user/team-folder accounting and upload enforcement.
22. Security hardening — IDOR, signed URLs, rate limiting, upload abuse protection and audit coverage.
23. IMKAN One UI — Zoho-like information architecture using IMKAN tokens/components only.
24. Responsive/RTL/i18n/accessibility — EN/AR, RTL/LTR, keyboard/focus/mobile behavior.
25. Final quality gate — backend/frontend tests, build, lint, security checks and browser E2E where Chromium is available.

## Implemented in this delivery

- Root-level file upload is now supported by the real upload API.
- Upload progress is reported from the signed PUT request rather than simulated progress.
- File move/copy and bulk move/trash/permanent-delete APIs were added.
- Folder move/copy and bulk move/trash APIs were added, including descendant-cycle protection.
- Permanent file/folder deletion is wired to the storage adapter deletion lifecycle.
- Empty Trash is implemented for visible tenant-owned deleted files.
- Direct share recipients and VIEW/COMMENT/EDIT permission metadata were added to the share contract and database.
- Shared With Me and Shared By Me APIs/routes were added.
- Folder/File `updated_at` is now tracked by Prisma for correct UI sorting and metadata.
- Existing Google OAuth implementation remains enabled; MFA is not introduced.
- Existing Favorites, Recent, Version History, Preview, Team Folder and audit foundations remain intact.

## Remaining production work

The phases above are the authoritative delivery sequence. Capabilities such as notifications, comments, full session revocation/password recovery, quota enforcement, richer ACL inheritance, and full admin/data administration still require their dedicated implementation before claiming 100% Zoho parity.

## Quality policy

Testing is performed at the end of each phase, not after every small edit. A phase cannot be marked complete until its relevant backend/frontend contract, tests, build and security checks pass.
