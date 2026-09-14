# Phase Roadmap

## 1. Environment & Scaffold
- Initialize Repos, Git hooks, Docker Compose, DB migrations.
- Gate: App builds and tests pass.

## 2. Core Backend & Auth
- JWT auth, Prisma schema, basic RBAC.
- Gate: Auth middleware blocks invalid requests.

## 3. Storage & Files API
- Folder/File CRUD, S3 integration.
- Gate: Can upload and download via API.

## 4. UI Integration
- Next.js frontend, connecting to APIs.
- Gate: E2E test passes for upload flow.
