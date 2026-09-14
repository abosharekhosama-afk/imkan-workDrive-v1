# Implementation Plan

## Overview
This document outlines the step-by-step strategy for building IMKAN WorkDrive.

## Implementation Slices
1. **Foundation:** Scaffold React, NestJS, MySQL schema setup, MinIO local setup, basic JWT auth.
2. **Tenancy & Identity:** Organizational isolation, basic user seed.
3. **Authorization:** Middleware for RBAC.
4. **Folder Core:** CRUD for Folders.
5. **File Metadata:** CRUD for File records.
6. **Object Storage (Upload/Download):** S3 Signed URLs integration.
7. **File Versions:** Version tracking upon re-upload.
8. **Sharing & Permissions:** Internal explicit sharing and public links.
9. **Search:** Basic MySQL full-text on names.
10. **Trash / Restore:** Soft deletes.
11. **Audit:** Activity logging.
12. **UI Integration:** Full IMKAN One UI.

## Definitions of Done
- Every slice MUST pass unit and integration tests.
- Every slice MUST pass negative authorization tests.
