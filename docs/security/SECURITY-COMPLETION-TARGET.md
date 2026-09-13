# Security Completion Target

Required before production sign-off:

- Tenant isolation and IDOR tests for every resource endpoint.
- Permission tests for every Team Folder role and direct share permission.
- Signed upload/download URLs with bounded expiry.
- Storage deletion lifecycle on permanent deletion.
- Upload MIME/size/hash validation.
- Rate limiting for authentication and public share verification.
- Audit events for upload/download/share/move/copy/delete/restore/version actions.
- Session revocation and password recovery before production authentication sign-off.
- Security review of Google OAuth callback and account linking.
- No client-provided orgId is trusted for authorization.
