# IMKAN WorkDrive — 20 Feature Foundation Release

## Implemented in this development revision

- Hardened centralized permissions and Team Folder role model with Commenter support.
- Added organization owner field and owner-aware role/removal protection.
- Added Team Folder controls for external sharing, viewer downloads and archive state.
- Added groups and group membership storage + admin API.
- Added subfolder ACL storage with hidden-folder support.
- Added organization security policy storage + admin API.
- Added retention policy storage + admin API.
- Added malware-scan lifecycle storage.
- Added device/session security inventory storage.
- Added security event storage.
- Added enterprise admin dashboard APIs for storage, users, large files, shares and audit.
- Added external-share administration endpoint.
- Added user suspension flow that revokes active sessions and protects the organization owner.
- Added admin groups/security/retention/audit UI surfaces.
- Added status/avatar/last-login fields to the user model.
- Added migration for all enterprise foundation tables.
- Added a structured roadmap and release gates.

## Existing capabilities retained

- File/version/storage-object model.
- Signed download/preview flow.
- Shares and share recipients by immutable user ID.
- Favorites, recent items, notifications and comments.
- Team Folder membership and activity.
- Trash/restore and audit logs.
- RTL WorkDrive-like shell and Arabic top-bar profile placement.

## Not falsely marked complete

Desktop sync, native mobile apps, full-text search engine, office editor, production malware engine integration, automated backups, SSO/SAML/SCIM, DLP/eDiscovery and formal compliance certifications still require dedicated implementation and infrastructure work. The new data models and admin controls provide the foundation for those phases.
