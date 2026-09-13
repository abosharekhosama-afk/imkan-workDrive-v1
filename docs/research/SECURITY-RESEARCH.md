# Security Research

## Required Controls
- **Authentication:** Standard email/password, SSO integration (PROPOSED), MFA support.
- **Tenant Isolation:** Logical separation of organization data in MySQL and Object Storage.
- **Authorization:** Server-side checks for every file access/download. IDOR protection via UUIDs.
- **Public Links:** Cryptographically secure random tokens.
- **File Security:** MIME type validation, malware scanning on upload (PROPOSED).
- **Audit Logs:** Immutable audit trail for admin actions and file access.
- **Data Encryption:** TLS in transit, AES-256 at rest (Object Storage level).
