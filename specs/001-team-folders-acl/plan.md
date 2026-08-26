# Implementation Plan: Team Folders and Intra-Organization Authorization

**Branch**: `001-team-folders-acl` | **Date**: 2026-08-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-team-folders-acl/spec.md`

**Note**: Discovery only. Do not edit production backend/frontend/schema until Phase 05 implementation is explicitly authorized.

## Summary

Close the same-organization authorization gap: Team Folder schema exists but APIs, membership checks, and `canRead` do not. Implement Team Folder CRUD + membership, then evaluate `canRead` / `canWrite` / `canShare` on every folder, file, share, search, download, upload, rename, and trash/restore path. Personal folders (`teamFolderId` null) keep Phase 04 rules so existing E2E stays valid. Keep `STORAGE_DRIVER=local`. Do not start Docker, MinIO, or S3 live verification. Do not implement SSO.

## Technical Context

**Language/Version**: TypeScript 5.x (NestJS 11 backend, Next.js 16 frontend)

**Primary Dependencies**: NestJS, Prisma 6, Next.js App Router, Playwright, Jest

**Storage**: MySQL 8.4.11 metadata (`workdrive_dev`); local disk object storage (`STORAGE_DRIVER=local`). S3 adapter retained, not live-verified.

**Testing**: Jest unit (`backend` / `frontend`); Jest e2e live IDOR; Playwright `frontend/e2e/workdrive-flow.spec.ts`; new live ACL suite. No Testcontainers. No Docker.

**Target Platform**: Windows 11 local services (MySQL84 Windows service, Node processes)

**Project Type**: Web application (Nest API + Next content region)

**Performance Goals**: Directory listing remains acceptable for seed-scale data (NF-201 is advisory; not a new infra project)

**Constraints**: JWT `org_id` authoritative; no client `orgId`; 404 when `canRead` is false; constitution server-side auth; IMKAN One content region only; Docker forbidden

**Scale/Scope**: One feature slice: Team Folder ACL + content-region UI + tests. No SSO, comments, S3 migration.

## Constitution Check

*GATE: Must pass before implementation. Re-checked after this design.*

| Principle | Status |
| :--- | :--- |
| I Repository source of truth | Pass — spec/plan/tasks in repo; contradictions recorded not silently rewritten |
| II Spec-driven | Pass — Research → Spec → Plan → Tasks; implement only after authorization |
| III Security by design | Pass — matrix, 404/403, IDOR, search/download ACL in spec |
| IV Multi-tenancy | Pass — JWT org + existing Prisma tenant interceptor; cross-tenant tests preserved |
| V MySQL 8.x | Pass — reuse existing Team Folder tables; migration only if implementation proves a constraint is required |
| VI API contracts | Pass — `contracts/team-folders.md`; existing unprefixed routes unchanged |
| VII Server-side permissions | Pass — PermissionService + negative tests required |
| VIII IMKAN One | Pass — content region, i18n EN/AR, no extra chrome |
| IX WorkDrive as reference | Pass — independent implementation of Team Folder ACL |
| X Testing before completion | Pass — unit + live ACL + IDOR regression + Playwright |
| XI Documentation/evidence | Pass — Agent OS + later phase completion record (implementation phase) |
| XII Phase gates | Pass — Phase 04 PASS; Phase 05 implementation not started |
| XIII No fabricated completion | Pass — this cycle claims SPEC_READY not feature PASS |
| XIV Change control | Pass — DEC-012; F-201/AUTHORIZATION-ARCHITECTURE contradictions queued as doc tasks |
| XV Agent rules | Pass — no production edits in discovery |

No constitution violations requiring Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-team-folders-acl/
├── plan.md
├── research.md
├── spec.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── team-folders.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root) — likely change set (do not edit now)

```text
backend/prisma/schema.prisma          # read-only unless a constraint is proven necessary
backend/src/permissions/permission.service.ts
backend/src/permissions/permission.service.spec.ts
backend/src/permissions/permissions.module.ts
backend/src/app.module.ts
backend/src/folders/folders.service.ts
backend/src/folders/folders.controller.ts
backend/src/folders/create-folder.schema.ts
backend/src/folders/folders.service.spec.ts
backend/src/folders/create-folder.schema.spec.ts
backend/src/files/files.service.ts
backend/src/files/files.controller.ts
backend/src/files/files.service.spec.ts
backend/src/files/files.trash-restore.spec.ts
backend/src/shares/shares.service.ts
backend/src/shares/shares.service.spec.ts
backend/src/search/search.service.ts
backend/src/search/search.service.spec.ts
backend/src/team-folders/                 # NEW module
  team-folders.module.ts
  team-folders.controller.ts
  team-folders.service.ts
  create-team-folder.schema.ts
  membership.schema.ts
frontend/src/lib/workspace-routes.ts
frontend/src/lib/api/team-folders.ts     # NEW
frontend/src/app/files/team-folders/     # NEW pages (content region)
frontend/src/components/file-browser.tsx
frontend/src/components/workdrive-nav.tsx
frontend/src/i18n/messages/en.json
frontend/src/i18n/messages/ar.json
backend/test/team-folder-acl.live.integration.e2e-spec.ts  # NEW
frontend/e2e/workdrive-flow.spec.ts      # add one TF path; keep existing 10
docs/api/API-CONTRACTS.md                # Team Folder routes only
docs/permissions/PERMISSION-IMPLEMENTATION-PLAN.md
docs/permissions/AUTHORIZATION-ARCHITECTURE.md
docs/specifications/FUNCTIONAL-REQUIREMENTS.md  # F-201 interpretation note
docs/plan/TRACEABILITY-MATRIX.md         # F-201 mapping
```

**Structure Decision**: Existing Nest + Next monorepo. Add `backend/src/team-folders/` rather than a new package. Reuse Prisma tenant scope (`TeamFolder`, `TeamFolderMember` already in `tenant-scope.ts`).

## Phase 0 Research

Completed in [research.md](./research.md). Verified against code: no `canRead`; OrgRole has no VIEWER; Team Folder APIs/UI missing; `teamFolderId` unvalidated; org-wide read; IDOR 18/18; Playwright 10/10; local storage.

## Phase 1 Design

- [data-model.md](./data-model.md)
- [contracts/team-folders.md](./contracts/team-folders.md)
- [quickstart.md](./quickstart.md)

## Implementation approach (for authorized implementers)

1. Extend `PermissionService` with resource `teamFolderId` (null = personal). Inject Prisma (or a membership port) so checks can load `TeamFolderMember`. Implement `canRead` / `canWrite` / `canShare` plus helpers for manage-members / manage-TF. Keep personal rules so existing unit tests for owner MEMBER vs JWT `VIEWER` still hold; add TF matrix tests (service may become async — update call sites).
2. New `TeamFoldersModule` registered in `app.module.ts`. Org ADMIN create; list/get filtered; membership CRUD with ORGANIZER limits and last-TF-ADMIN guard. Creating a TF creates one root `Folder`.
3. `FoldersService.create`: inherit `teamFolderId` from parent; never trust a conflicting client `teamFolderId`; require `canWrite` on target TF; `listContents`/`getById` take user and filter by `canRead`. Rename/delete already call `canWrite` — switch unauthorized-read to 404.
4. `FilesService.requestUpload` / `createDownloadUrl` / `listTrash`: ACL before storage URLs; trash list excludes unreadable TF files.
5. `SharesService.createShare` uses updated `canShare`. Public verify unchanged.
6. `SearchService.search` constrains to personal + allowed TF ids.
7. Frontend: nav + team-folder browse/members in content region; i18n keys; API client without `orgId`.
8. Tests: unit matrix → live ACL e2e → Playwright one path → re-run IDOR 18/18 and browser 10/10. Do not claim PASS without executing those suites.
9. Documentation polish only for TF/ACL contradictions listed in research (not `/api/v1`, login, Testcontainers, Zod).

## Complexity Tracking

None.
