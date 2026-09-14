# Backend Architecture

## Stack
- Framework: Node.js (Express or NestJS - NestJS PROPOSED for modularity).
- Language: TypeScript.
- ORM: Prisma or TypeORM (Prisma PROPOSED for type-safety with MySQL).
- Validation: Zod.

## Core Services
- **Auth Service:** Verifies tokens, checks tenant scopes.
- **Resource Service:** Manages folders, files metadata, trash.
- **Storage Service:** Interfaces with S3 object storage (signed URLs, uploads).
- **Permission Service:** Enforces RBAC on every request.
- **Activity Service:** Logs audits and generates notifications.

## Background Jobs
- Queue: BullMQ with Redis (PROPOSED).
- Jobs: Hard deletion of expired trash, search index updates, async virus scanning.
