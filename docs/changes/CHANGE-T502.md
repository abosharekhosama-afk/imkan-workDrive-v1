# Implementation Record: T-502 Password verification on public links

## Objective
Unauthenticated verification of a public share token and optional password.

## Endpoint
`POST /share/public` (`@Public()`, allowed by SECURITY-ARCHITECTURE)

Request: `{ token, password? }`  
Response: `{ resource_type, resource_id, can_download, expires_at }`

## Files
- `backend/src/shares/shares.controller.ts`
- `backend/src/shares/shares.service.ts` (`verifyPublicShare`)
- `backend/src/shares/verify-share.schema.ts`
- `backend/src/shares/shares.service.spec.ts`

## Security
- Unknown or expired token → 404.
- Password required when `password_hash` is set; wrong password → 401.
- Timing-safe scrypt compare.
- Does not issue a download URL here; `can_download` is returned for the client/later download path.

## Tests executed
Same Nest build + jest run as T-501. Correct password, wrong password, expired link.

## Status
PASS (unit). Live MySQL/E2E: NOT RUN.
