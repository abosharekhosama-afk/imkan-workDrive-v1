# Zoho WorkDrive Parity Target

Zoho WorkDrive is the functional and information-architecture reference. IMKAN One remains the visual authority. The application must not copy proprietary assets, branding, or source code.

## Non-negotiable rules

- Every visible operation must have a real backend capability.
- UI visibility is never an authorization boundary.
- Organization/tenant identity comes from the authenticated server context.
- All resource access is tenant-scoped and permission-checked server-side.
- File bytes use the storage abstraction; database rows contain metadata and version references.
- No MFA is included in this project scope.
- Google OAuth is real OAuth and requires configured credentials.
- EN/AR and RTL/LTR are first-class requirements.
- Zoho is a UX/feature reference; IMKAN tokens/components are the design authority.
