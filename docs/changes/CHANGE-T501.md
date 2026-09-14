# Implementation Record: T-501 POST /shares

## Objective
Create tenant-scoped public share links with optional password, expiration, and download restriction.

## Endpoint
`POST /shares` (JWT required)

Request: `{ resource_type, resource_id, expires_at?, password?, can_download? }`  
Response: `{ link_url }`  
`can_download` defaults to true (F-304).

## Files
- `backend/src/shares/shares.controller.ts`
- `backend/src/shares/shares.service.ts`
- `backend/src/shares/shares.module.ts`
- `backend/src/shares/create-share.schema.ts`
- `backend/src/shares/create-share.schema.spec.ts`
- `backend/src/shares/shares.service.spec.ts`
- `backend/src/permissions/permission.service.ts`
- `backend/src/crypto/secret-hash.ts`

## Security
- Tenant from JWT. Client `orgId` → 403.
- Cross-tenant resource → 404.
- Viewer / non-owner member → 403.
- `link_token` is 32 random bytes (base64url). Password stored as scrypt hash, never plaintext.
- Audit `SHARE_CREATED`.
- Revocation: schema has no `revoked_at`. Inactive shares are those with `expires_at <= now`. No separate revoke API in the approved contract.

## Tests executed
`npx nest build` — success  
Focused jest including createShare happy path, IDOR 404, viewer 403.

## Status
PASS (unit). Live MySQL/E2E: NOT RUN.
