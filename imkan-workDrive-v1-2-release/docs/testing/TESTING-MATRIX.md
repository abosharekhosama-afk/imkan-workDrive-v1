# Testing Matrix

| Feature | Unit | DB Integration | API Int | Security (Negative) | E2E |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Auth Middleware | Yes | No | Yes | Yes (Forged JWT) | No |
| Folder CRUD | No | Yes | Yes | Yes (IDOR across orgs) | Yes |
| S3 Signed URLs | Yes | No | Yes | Yes (Expired token) | Yes (Upload flow) |
| Permissions | Yes | Yes | Yes | Yes (Viewer trying to edit) | No |
