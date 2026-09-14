# Implementation Plan: File Preview UI

**Branch**: `002-file-preview-ui` | **Date**: 2026-08-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-file-preview-ui/spec.md`

## Summary

Add inline preview capability for PDF, images, video, and text/code files in the IMKAN One content region. Reuse existing signed download URLs from storage service. No new backend routes — extend frontend components only. Respect Phase 05 ACL (Team Folder permissions, cross-tenant isolation).

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js 16 frontend, NestJS 11 backend)

**Primary Dependencies**: Next.js App Router, React 19, Tailwind CSS 4, existing i18n system, existing API client

**Storage**: MySQL 8.4.11 metadata; local disk object storage (`STORAGE_DRIVER=local`). S3 adapter retained.

**Testing**: Jest unit (frontend); Playwright E2E. No Testcontainers. No Docker.

**Target Platform**: Windows 11 local services (MySQL84 Windows service, Node processes)

**Project Type**: Web application (Nest API + Next content region)

**Performance Goals**: Preview opens <500ms for files <10MB on local network

**Constraints**: JWT `org_id` authoritative; no client `orgId`; 404 when `canRead` false; constitution server-side auth; IMKAN One content region only; Docker forbidden

**Scale/Scope**: One feature slice: File Preview UI components + preview routing. No backend changes.

## Constitution Check

*GATE: Must pass before implementation. Re-checked after this design.*

| Principle | Status |
| :--- | :--- |
| I Repository source of truth | Pass — spec/plan/tasks in repo |
| II Spec-driven | Pass — Spec → Plan → Tasks |
| III Security by design | Pass — reuse existing ACL, signed URLs |
| IV Multi-tenancy | Pass — reuse JWT org + PermissionService |
| V MySQL 8.x | Pass — no schema changes |
| VI API contracts | Pass — no new routes, reuse `/files/:id/download` |
| VII Server-side permissions | Pass — frontend never authorizes |
| VIII IMKAN One | Pass — content region, i18n EN/AR |
| IX WorkDrive as reference | Pass — independent implementation |
| X Testing before completion | Pass — unit + Playwright |
| XI Documentation/evidence | Pass — Agent OS + completion record |
| XII Phase gates | Pass — Phase 05 PASS |
| XIII No fabricated completion | Pass — this cycle claims PLAN_READY |
| XIV Change control | Pass — DEC-012 recorded |
| XV Agent rules | Pass — no production edits in discovery |

No constitution violations requiring Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/002-file-preview-ui/
├── plan.md
├── research.md
├── spec.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── preview-api.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root) — likely change set (do not edit now)

```text
frontend/src/components/
├── file-preview.tsx              # Main preview orchestrator
├── file-preview/
│   ├── pdf-preview.tsx           # PDF.js viewer
│   ├── image-preview.tsx         # Image zoom/pan/rotate
│   ├── video-preview.tsx         # Native video player
│   └── text-preview.tsx          # Syntax highlighted text
├── preview-toolbar.tsx           # Zoom, nav, download, close
└── preview-modal.tsx             # Modal wrapper (reuse Modal)
frontend/src/app/files/
├── [fileId]/
│   └── preview/
│       └── page.tsx              # Preview route (optional, for direct links)
frontend/src/lib/api/
├── preview.ts                    # Preview-specific API helpers
└── client.ts                     # Extend with preview helpers
frontend/src/i18n/messages/
├── en.json                       # Add preview keys
└── ar.json                       # Add preview keys (RTL)
frontend/e2e/
├── file-preview.spec.ts          # Playwright tests
└── helpers/
    └── preview.ts                # Test helpers
```

**Structure Decision**: Extend existing Next.js + React monorepo. Add preview components under `frontend/src/components/file-preview/`. Reuse existing Modal, i18n, API client patterns.

## Phase 0 Research

Completed in [research.md](./research.md). Verified against code: existing `/files/:id/download` returns signed URL; PDF.js via CDN; Prism.js for syntax highlighting; Modal component exists; i18n system supports EN/AR.

## Phase 1 Design

- [data-model.md](./data-model.md) — Preview session state, no new DB entities
- [contracts/preview-api.md](./contracts/preview-api.md) — Client-side preview API contract
- [quickstart.md](./quickstart.md) — Validation scenarios

## Implementation approach (for authorized implementers)

1. **Extend API client** (`frontend/src/lib/api/preview.ts`): Add `getPreviewUrl(fileId)` reusing `/files/:id/download`, and `getVersionPreviewUrl(fileId, versionNumber)` for version history integration
2. **Create preview components**:
   - `PreviewModal` — wrapper using existing `Modal` component, handles Escape close, focus trap
   - `PreviewToolbar` — zoom controls, page nav (PDF), download, open in new tab, close
   - `PdfPreview` — PDF.js via CDN, lazy-loaded, page navigation, zoom, text search
   - `ImagePreview` — `<img>` with zoom (wheel/touch), pan (drag), rotate (90°), metadata panel
   - `VideoPreview` — native `<video>` with controls, fallback to download link
   - `TextPreview` — Prism.js syntax highlighting, line numbers, language detection from extension/MIME
   - `FilePreview` — orchestrator: detects MIME type, renders appropriate sub-component, handles loading/error states
3. **Integrate with file browser**: Add "Preview" action to `ActionDropdown` in `file-table.tsx` (next to Download). On click, open `PreviewModal` with `FilePreview`
4. **Add i18n keys** for preview toolbar, loading, error, file type labels
5. **Add preview route** (optional): `/files/[fileId]/preview` for direct links/shares
6. **Tests**: Unit for MIME type detection, preview toolbar logic; Playwright for PDF/image/video/text preview flows
7. **Regress**: Run Phase 05 test suites (IDOR 18/18, Team Folder ACL 28/28, Playwright 11/11)

## Complexity Tracking

None.

## Phase Dependencies

- **Phase 05 complete**: Team Folder ACL, file APIs, i18n, content region shell — REQUIRED
- File Preview UI (this) and Version History UI (003) can be developed in parallel — both reuse preview components