# Traceability Matrix

| Requirement | Architecture Component | DB/API Component | Task ID | Test |
| :--- | :--- | :--- | :--- | :--- |
| F-101: Upload Files | Backend S3 Service | `POST /upload-request` | T-402 | S3 Signature Integration Test |
| F-201: Team Folders | Backend Resource | `team_folders` table | T-301 | Create Folder API Test |
| F-301: Public Links | Backend Share | `shares` table | T-501 | Public Link JWT Generation |
| NF-103: Tenant Isolation| Auth Middleware | `WHERE org_id=?` | T-201 | Cross-tenant Negative Test |
