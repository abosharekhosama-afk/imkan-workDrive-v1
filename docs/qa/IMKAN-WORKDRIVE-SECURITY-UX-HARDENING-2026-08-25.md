# IMKAN WorkDrive Security & UX Hardening — 2026-08-25

## Applied
- Personal My Files/My Folders are no longer readable by other organization members solely because they share an organization.
- Root folder listings are filtered by authorization for both folders and files.
- Team Folder access remains membership-based; public-to-organization flags no longer bypass membership inside the central permission service.
- Direct file shares can grant read access to an explicit recipient when active and unexpired; authorization still uses stable user IDs.
- Version/download paths reuse the protected file-read decision.
- Organization owner protection is enforced by treating the earliest organization admin as the immutable owner fallback for existing data; owner demotion/removal is blocked.
- RTL top bar keeps the account/avatar cluster on the physical left and improves profile affordance.
- Added a regression test covering cross-user personal-file isolation and owner access.

## Remaining architectural recommendation
For a future migration, add an explicit `Organization.ownerId` foreign key populated from the original organization creator. The current fallback preserves compatibility without a destructive migration.

## Validation
Run backend unit/e2e suites and frontend lint/build in an environment with dependencies installed and a test database configured.
