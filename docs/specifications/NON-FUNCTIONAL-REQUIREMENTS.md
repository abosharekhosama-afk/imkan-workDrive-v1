# Non-Functional Requirements

## 1. Security & Compliance
- NF-101: All data at rest must be encrypted using AES-256 (in Object Storage).
- NF-102: All data in transit must be encrypted using TLS 1.2 or higher.
- NF-103: The system must enforce strict tenant isolation at the database and application levels.

## 2. Performance
- NF-201: Directory listings must load in under 1.5 seconds.
- NF-202: File uploads should support multipart chunking for large files.

## 3. Localization
- NF-301: The system must support English (LTR) and Arabic (RTL).
- NF-302: The UI must correctly load Zoho Puvi (EN) or IBM Plex Sans Arabic (AR).
