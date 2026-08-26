# System Boundaries

## Internal Systems
- **Web App (Frontend):** React/SPA using IMKAN One Design System.
- **API Server:** Node.js/Backend handling business logic and authorization.
- **Database:** MySQL 8.x (Metadata, roles, configuration).
- **Object Storage:** S3-compatible (File binaries).

## External Systems
- **Identity Provider (IdP):** (PROPOSED) For SSO / Authentication.
- **Email Service:** For notifications and invitations.
- **Virus Scanner:** (PROPOSED) ICAP integration for scanning uploads.
