# Security Implementation Plan

## Critical Controls
- **Control S-1:** API Gateway JWT Middleware verifying signature and extracting `org_id`.
- **Control S-2:** Prisma extension appending `org_id = current_org_id` to every query to prevent IDOR.
- **Control S-3:** Upload endpoint verifying requested MIME type vs allowed list.
- **Control S-4:** S3 signed URLs generated with strict `expiresIn` (e.g., 15 minutes).

## Testing
- Negative test S-1: Send forged JWT.
- Negative test S-2: Request `/files/{id}` where `{id}` belongs to another `org_id`.
