# Development Environment

## Target Stack
- Runtime: Node.js 20+
- Package Manager: npm (or pnpm PROPOSED for monorepos).
- Frontend: Next.js/Vite with TypeScript.
- Backend: NestJS/Express with TypeScript.
- Database: MySQL 8.x via Docker.
- Object Storage: MinIO via Docker (local S3 equivalent).
- Migrations: Prisma Migrate.

## Seed Strategy
- Seed scripts will populate 1 Organization, 3 Users (Admin, Organizer, Viewer), and sample folders for quick bootstrapping.
