# Feature Specification: File Preview UI

**Feature Branch**: `002-file-preview-ui`

**Created**: 2026-08-23

**Status**: Draft

**Input**: User description: "File Preview UI for PDF, images, video, and text files in IMKAN WorkDrive content region"

## Problem Statement

Users can upload and manage files (PDF, images, videos, text) but cannot preview them inline without downloading. Phase 04/05 delivered file upload, download, share, and ACL but no inline preview capability. Users must download files to view content, which breaks workflow for quick review of documents, images, and media.

## Goals

- Provide inline preview for common file types: PDF, images (PNG, JPG, GIF, WebP, SVG), video (MP4, WebM), and text-based files (TXT, MD, JSON, CSV, code files)
- Preview must respect existing ACL (Team Folder permissions, cross-tenant isolation)
- Preview opens in content region (IMKAN One mount), not new tab/window
- Support keyboard navigation and accessibility (ARIA)
- Arabic RTL layout support via existing locale system
- No Docker/MinIO/S3 dependencies — use existing local storage signed URLs

## Non-Goals

- Document editing/annotation (comments, markup) — future phase
- Collaborative real-time preview
- Thumbnail generation service (use direct file rendering)
- Office document preview (DOCX, XLSX, PPTX) — requires conversion service
- Full-screen presentation mode
- Download prevention in preview (capability URLs already handle this)

## User Scenarios & Testing

### User Story 1 - Preview a PDF document (Priority: P1)

A user clicks a PDF file in the file browser. The preview opens in-place showing the first page with page navigation, zoom controls, and search within document.

**Acceptance Scenarios**:
1. **Given** a user with `canRead` on a PDF file, **When** they click the file row, **Then** a preview panel opens showing page 1
2. **Given** a PDF with multiple pages, **When** user clicks next/previous, **Then** page changes without full reload
3. **Given** a user without `canRead` (non-member, cross-tenant), **When** they attempt to open preview, **Then** they receive 404/forbidden (existing ACL)
4. **Given** a shared public link, **When** unauthenticated user opens it, **Then** preview works via capability URL

### User Story 2 - Preview images (Priority: P1)

A user clicks an image file. The preview shows the image at natural size with zoom/pan, rotation, and format info.

**Acceptance Scenarios**:
1. **Given** an image file (PNG/JPG/GIF/WebP/SVG), **When** opened, **Then** renders at 100% zoom centered
2. **Given** zoom controls, **When** user zooms in/out, **Then** image scales smoothly with pan support
3. **Given** EXIF metadata exists, **When** user opens info panel, **Then** shows dimensions, format, size

### User Story 3 - Preview video files (Priority: P1)

A user clicks a video file. The preview shows native HTML5 video player with controls.

**Acceptance Scenarios**:
1. **Given** MP4/WebM video, **When** opened, **Then** plays inline with native controls
2. **Given** video duration > 0, **When** user seeks, **Then** seeks without full reload
3. **Given** no codec support, **When** opened, **Then** shows fallback message with download link

### User Story 4 - Preview text/code files (Priority: P1)

A user clicks a text-based file. The preview shows syntax-highlighted content with line numbers.

**Acceptance Scenarios**:
1. **Given** TXT/MD/JSON/CSV/JS/TS/PY/etc., **When** opened, **Then** shows syntax highlighting
2. **Given** large file (>100KB), **When** opened, **Then** loads progressively or shows truncation notice
3. **Given** user switches theme (light/dark), **When** preview open, **Then** syntax colors adapt

### User Story 5 - Preview navigation and accessibility (Priority: P2)

Users can navigate between previews, close preview, and use keyboard shortcuts.

**Acceptance Scenarios**:
1. **Given** preview open, **When** user presses Escape, **Then** preview closes and focus returns to file row
2. **Given** multiple files in folder, **When** user presses arrow keys, **Then** navigates to next/previous previewable file
3. **Given** screen reader, **When** preview opens, **Then** announces file name, type, and available actions

## Requirements

### Functional Requirements

- **FR-001**: System MUST support inline preview for PDF, images, video, and text/code files
- **FR-002**: Preview MUST open in content region without page navigation (single-page app behavior)
- **FR-003**: Preview MUST respect existing ACL — `canRead` required, cross-tenant = 404
- **FR-004**: Preview MUST use existing signed download URLs from storage service (no new storage paths)
- **FR-005**: PDF preview MUST support page navigation, zoom (50%-300%), and text search
- **FR-006**: Image preview MUST support zoom (25%-500%), pan, rotation (90° increments), and format metadata display
- **FR-007**: Video preview MUST use native `<video>` element with standard controls (play, pause, seek, volume, fullscreen)
- **FR-008**: Text/code preview MUST support syntax highlighting for common languages (JS, TS, Python, JSON, MD, HTML, CSS, SQL, etc.) with line numbers
- **FR-009**: Preview MUST support keyboard navigation: Escape to close, Arrow Left/Right for previous/next file, +/- for zoom
- **FR-010**: Preview MUST be fully localized (EN/AR) with RTL support for Arabic
- **FR-011**: Preview MUST announce state changes to screen readers (ARIA live regions)
- **FR-012**: Preview MUST handle files up to 50MB for text, 100MB for PDF/video without blocking UI
- **FR-013**: Preview MUST show loading state while fetching signed URL and initial content
- **FR-014**: Preview MUST show error state if signed URL expires or file not accessible
- **FR-015**: Preview MUST include "Download" and "Open in new tab" actions in toolbar

### Security Requirements

- **SR-001**: Preview signed URLs MUST be short-lived (reuse existing download URL TTL)
- **SR-002**: Preview MUST NOT bypass ACL — all preview requests go through existing `canRead` check
- **SR-003**: Preview MUST NOT expose file paths or storage keys in client-side code
- **SR-004**: Cross-tenant preview attempts MUST return 404 (consistent with IDOR protection)

### Error / Status Semantics

| Situation | Behavior |
| :--- | :--- |
| Missing/invalid JWT | 401 → redirect to auth |
| No `canRead` on file | 404 (not 403) to prevent enumeration |
| Signed URL expired | Show retry button, re-fetch URL |
| Unsupported file type | Show info card with download link |
| Network error | Show retry with exponential backoff |

## Key Entities

- **File**: Existing entity with `id`, `name`, `mimeType`, `size`, `folderId`, `teamFolderId`, `ownerId`
- **Preview Session**: Ephemeral client state tracking current preview (file, page, zoom, position)
- **Signed URL**: Existing capability URL from storage service (`GET /files/:id/download`)

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of supported MIME types render without download (PDF, PNG, JPG, GIF, WebP, SVG, MP4, WebM, TXT, MD, JSON, CSV, JS, TS, PY, HTML, CSS, SQL)
- **SC-002**: Preview opens within 500ms for files <10MB on local network
- **SC-003**: Zero ACL bypass — all existing IDOR (18/18) and Team Folder ACL (28/28) tests pass unchanged
- **SC-004**: Keyboard-only users can open, navigate, and close preview without mouse
- **SC-005**: Arabic RTL layout renders correctly for all preview types
- **SC-006**: No new backend API routes required (reuse existing download/share endpoints)

## Assumptions

- Existing `GET /files/:id/download` returns signed URL usable for `<iframe>`, `<img>`, `<video>`, and fetch()
- `STORAGE_DRIVER=local` serves files with correct `Content-Type` headers
- PDF.js (or similar) can be loaded via CDN for PDF rendering
- Syntax highlighting via lightweight library (Prism, Shiki, or similar) loaded dynamically
- No server-side rendering/conversion needed — all client-side
- File size limits enforced by existing upload validation

## Risks

- PDF rendering performance on large documents (>50 pages) — mitigate with lazy page loading
- Video codec compatibility across browsers — fallback to download link
- Memory usage for large text files — implement virtualized line rendering
- Signed URL expiration during long preview sessions — auto-refresh before expiry

## Explicit Exclusions

- Office documents (DOCX, XLSX, PPTX) — require LibreOffice/OnlyOffice conversion service
- Collaborative annotations/comments
- Thumbnail generation pipeline
- Preview analytics/tracking
- Mobile-specific gestures (pinch zoom handled by browser)

## Acceptance Criteria (feature)

1. Spec, plan, and tasks exist under `specs/002-file-preview-ui/`
2. After implementation: all supported file types preview inline, ACL enforced, keyboard accessible, EN/AR localized
3. No regression in Phase 04/05 tests (IDOR 18/18, Team Folder ACL 28/28, Playwright 11/11)

## Traceability

| This spec | Existing artifact | Resolution |
| :--- | :--- | :--- |
| FR-001 | Phase 04 File upload/download | Extend with preview |
| FR-003 | Phase 05 Team Folder ACL | Reuse PermissionService |
| FR-004 | Storage service signed URLs | Reuse download endpoint |
| FR-010 | Frontend i18n system | Extend with preview keys |

## Dependencies

- Phase 05 complete (Team Folder ACL, file APIs, i18n, content region shell)
- `GET /files/:id/download` endpoint functional
- Local storage serving with correct MIME types

## Quickstart (after implementation)

```bash
# Backend: no changes needed (reuse existing endpoints)
cd backend && npm test

# Frontend unit tests
cd frontend && npm test

# E2E: preview flows
cd frontend && npx playwright test e2e/file-preview.spec.ts
```