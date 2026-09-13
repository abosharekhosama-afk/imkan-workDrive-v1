# IMKAN WorkDrive — 25-Phase Delivery Roadmap

| # | Phase | Delivery status in this build |
|---:|---|---|
| 01 | Production upload | Implemented: root upload + signed upload + real progress |
| 02 | Storage abstraction | Implemented: local/S3 signed access; deletion hook added |
| 03 | Team-folder roles | Existing foundation retained and server enforced |
| 04 | Folder/file ACL | Existing foundation retained; destination checks added |
| 05 | Internal sharing | Implemented: recipient-aware share contract |
| 06 | External sharing | Existing protected public-share foundation retained |
| 07 | Move/copy | Implemented for files and recursive folders |
| 08 | Trash/recovery | Implemented: restore + permanent delete + empty trash |
| 09 | Bulk operations | Implemented: bulk file/folder move/trash/permanent delete APIs |
| 10 | Version history | Existing download/restore implementation retained |
| 11 | Preview | Existing signed preview implementation retained |
| 12 | Recent/access history | Existing AccessEvent/recent implementation retained |
| 13 | Shared views | Implemented: Shared With Me / Shared By Me APIs and pages |
| 14 | Search | Existing tenant-scoped search retained |
| 15 | Favorites | Existing real backend/frontend implementation retained |
| 16 | Notifications | Implemented — persistent inbox API and read-state controls |
| 17 | Collaboration/comments | Implemented — file comments, replies and moderation controls |
| 18 | Auth lifecycle | Implemented — signup/login/logout/session revocation/password recovery |
| 19 | Google OAuth | Implemented in current backend; credentials required for runtime |
| 20 | Admin console | Implemented — tenant overview and user administration API |
| 21 | Storage quotas | Implemented — tenant quota API and upload enforcement |
| 22 | Security hardening | Strengthened — revocable sessions, reset tokens, tenant checks; rate-limit/external security review remains |
| 23 | IMKAN One UI | In progress — IMKAN tokens are visual authority; Zoho is functional reference |
| 24 | Responsive/RTL/i18n/a11y | Existing EN/AR + RTL/LTR retained; final audit required |
| 25 | Final quality gate | Pending until all planned capabilities are complete |

## Completion rule

A row is not promoted to `COMPLETE` merely because a route exists. The backend capability, authorization, UI, persistence, error handling and phase-level verification must all exist.
