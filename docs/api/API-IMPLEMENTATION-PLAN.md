# API Implementation Plan

## Sequencing
1. `/auth/login` (Mock SSO for dev).
2. `/folders` (CRUD, isolated by org_id).
3. `/files` (Metadata CRUD).
4. `/files/upload` (S3 integration).
5. `/shares` (Public links).
6. `/search` (MySQL full-text query).

## Quality Gates
- Every endpoint requires Zod validation schema.
- Every endpoint requires an E2E API test (Supertest).
