---
description: "Task list for File Preview UI (P0 Core Parity)"
---

# Tasks: File Preview UI

**Input**: Design documents from `specs/002-file-preview-ui/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Status**: Ready for implementation **only after explicit user authorization**.

**Tests**: Required (user-facing feature). Write failing tests before or with matching production change.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3 / US4 / US5 from spec.md

---

## Phase 1: Setup

**Purpose**: Confirm baseline; no production changes yet

- [ ] T001 Read `docs/releases/PHASE-05-COMPLETION.md` and `specs/002-file-preview-ui/spec.md`; confirm Docker/MinIO not started, `STORAGE_DRIVER=local` stays
- [ ] T002 [P] Confirm existing regression gates: `backend/test/idor.live.integration.e2e-spec.ts` (18/18), `backend/test/team-folder-acl.live.integration.e2e-spec.ts` (28/28), `frontend/e2e/workdrive-flow.spec.ts` (10/10) + Team Folder case (1/1)

---

## Phase 2: Foundational (blocks all stories)

**Purpose**: Preview infrastructure — API client, MIME detection, preview modal shell

- [ ] T003 Add preview API helpers in `frontend/src/lib/api/preview.ts`: `getPreviewUrl`, `getVersionPreviewUrl`, `getPreviewMimeCategory`, `getLanguageFromMime`
- [ ] T004 [P] Add MIME category detection unit tests in `frontend/src/lib/api/preview.spec.ts`
- [ ] T005 Create `PreviewModal` component in `frontend/src/components/preview-modal.tsx` wrapping existing `Modal` with focus trap, Escape close, backdrop click close
- [ ] T006 [P] Add `PreviewModal` unit tests for keyboard/accessibility in `frontend/src/components/preview-modal.spec.ts`
- [ ] T007 Create `PreviewToolbar` component in `frontend/src/components/preview-toolbar.tsx` with zoom controls, page nav (PDF), download, open-in-new-tab, close
- [ ] T008 [P] Add i18n keys for preview in `frontend/src/i18n/messages/en.json` and `ar.json` (toolbar labels, loading, error, file type names)

**Checkpoint**: Preview modal opens/closes, toolbar renders, i18n keys present

---

## Phase 3: User Story 1 - PDF Preview (Priority: P1)

**Goal**: Inline PDF viewing with page nav, zoom, text search

### Tests for User Story 1

- [ ] T009 [US1] Add Playwright test `e2e/file-preview.spec.ts` for PDF: open, page next/prev, zoom, search, close
- [ ] T010 [P] [US1] Add unit test for PDF page/zoom state logic

### Implementation for User Story 1

- [ ] T011 [US1] Create `PdfPreview` component in `frontend/src/components/file-preview/pdf-preview.tsx` using PDF.js via CDN (lazy load)
- [ ] T012 [US1] Implement page navigation (next/prev, page input), zoom (50%-300%), text search with highlight
- [ ] T013 [US1] Handle loading states, render errors, password-protected PDFs (show fallback)
- [ ] T014 [US1] Integrate `PdfPreview` into `FilePreview` orchestrator (MIME category 'pdf')

**Checkpoint**: PDF files preview inline with full controls

---

## Phase 4: User Story 2 - Image Preview (Priority: P1)

**Goal**: Image viewing with zoom, pan, rotation, metadata

### Tests for User Story 2

- [ ] T015 [US2] Add Playwright test for image: open, zoom wheel, drag pan, rotate 90°, metadata panel
- [ ] T016 [P] [US2] Add unit test for image zoom/pan/rotate state logic

### Implementation for User Story 2

- [ ] T017 [US2] Create `ImagePreview` component in `frontend/src/components/file-preview/image-preview.tsx`
- [ ] T018 [US2] Implement zoom (wheel/touch pinch, 25%-500%), pan (drag), rotation (90° increments), reset button
- [ ] T019 [US2] Add metadata panel (dimensions, format, file size, EXIF if available)
- [ ] T020 [US2] Handle SVG rendering (security: sanitize or use `<img>`), loading/error states
- [ ] T021 [US2] Integrate `ImagePreview` into `FilePreview` orchestrator (MIME category 'image')

**Checkpoint**: Image files preview inline with full controls

---

## Phase 5: User Story 3 - Video Preview (Priority: P1)

**Goal**: Native video playback with standard controls

### Tests for User Story 3

- [ ] T022 [US3] Add Playwright test for video: open, play/pause, seek, volume, fullscreen, fallback
- [ ] T023 [P] [US3] Add unit test for video fallback detection

### Implementation for User Story 3

- [ ] T024 [US3] Create `VideoPreview` component in `frontend/src/components/file-preview/video-preview.tsx`
- [ ] T025 [US3] Use native `<video>` with `controls`, `preload="metadata"`, fallback UI for unsupported codecs
- [ ] T026 [US3] Show file info overlay (duration, resolution if available via video metadata)
- [ ] T027 [US3] Integrate `VideoPreview` into `FilePreview` orchestrator (MIME category 'video')

**Checkpoint**: Video files play inline with native controls

---

## Phase 6: User Story 4 - Text/Code Preview (Priority: P1)

**Goal**: Syntax-highlighted text/code viewing with line numbers

### Tests for User Story 4

- [ ] T028 [US4] Add Playwright test for text: open JS/TS/JSON/MD/CSV → syntax highlighting, line numbers, theme
- [ ] T029 [P] [US4] Add unit test for language detection from extension/MIME

### Implementation for User Story 4

- [ ] T030 [US4] Create `TextPreview` component in `frontend/src/components/file-preview/text-preview.tsx`
- [ ] T031 [US4] Integrate Prism.js (dynamic import) for syntax highlighting; support languages from data-model.md
- [ ] T032 [US4] Add line numbers, copy button, theme sync (light/dark via CSS variables)
- [ ] T033 [US4] Handle large files (>100KB): virtualized rendering or truncation notice with "load more"
- [ ] T034 [US4] Integrate `TextPreview` into `FilePreview` orchestrator (MIME category 'text')

**Checkpoint**: Text/code files preview inline with syntax highlighting

---

## Phase 7: User Story 5 - Integration & Navigation (Priority: P2)

**Goal**: File browser integration, keyboard nav, accessibility, version history preview

### Tests for User Story 5

- [ ] T035 [US5] Add Playwright tests: ActionDropdown "Preview" button, Escape close, arrow key version nav, screen reader announcements
- [ ] T036 [P] [US5] Add unit test for preview orchestrator MIME routing

### Implementation for User Story 5

- [ ] T037 [US5] Add "Preview" action to `ActionDropdown` in `frontend/src/components/file-table.tsx` (next to Download)
- [ ] T038 [US5] Wire `PreviewModal` + `FilePreview` into `FileBrowser` component state
- [ ] T039 [US5] Implement keyboard navigation: Escape closes modal, Arrow Left/Right navigates to prev/next previewable file in folder
- [ ] T040 [US5] Add ARIA live region announcements for preview open/close, page change, errors
- [ ] T041 [US5] Add preview route `/files/[fileId]/preview` in `frontend/src/app/files/[fileId]/preview/page.tsx` for direct links
- [ ] T042 [US5] Add `getVersionPreviewUrl` support for version history integration (preview specific version)
- [ ] T043 [US5] Ensure RTL layout works for all preview components (toolbar, metadata, PDF sidebar)

**Checkpoint**: Preview accessible from file browser, keyboard nav works, version preview ready

---

## Phase 8: Polish, Regression, Docs

- [ ] T044 Run backend unit tests: `cd backend && npm test` (169 pass)
- [ ] T045 Run backend e2e: `cd backend && npm run test:e2e` (48 pass: 18 IDOR + 28 ACL + 2 new preview?)
- [ ] T046 Run frontend unit tests: `cd frontend && npm test` (26+ pass)
- [ ] T047 Run frontend typecheck: `cd frontend && npm run typecheck`
- [ ] T048 Run browser gate: `cd frontend && npm run test:e2e:browser:gate` (11+ pass)
- [ ] T049 [P] Update `docs/api/API-CONTRACTS.md` with preview usage notes (no new routes)
- [ ] T050 [P] Record Phase 06a implementation evidence under `docs/releases/PHASE-06a-COMPLETION.md`
- [ ] T051 [P] Follow `specs/002-file-preview-ui/quickstart.md` as operator checklist

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No code changes
- **Foundational (Phase 2)**: Blocks all user stories
- **US1-US4 (Phases 3-6)**: Can run in parallel after Phase 2 (different components)
- **US5 (Phase 7)**: Depends on US1-US4 components existing
- **Polish (Phase 8)**: Depends on all stories complete

### User Story Dependencies

- **US1 (PDF)**: After Phase 2
- **US2 (Image)**: After Phase 2
- **US3 (Video)**: After Phase 2
- **US4 (Text)**: After Phase 2
- **US5 (Integration)**: After US1-US4

### Parallel Opportunities

- T004 with T003, T006 with T005, T008 with T007
- T010 with T009, T016 with T015, T023 with T022, T029 with T028
- US1-US4 implementation (T011-T034) can run in parallel
- T044-T048 regression runs in parallel after all implementation

---

## Parallel Example: User Story 1

```text
T009 Playwright PDF test (failing)
T010 Unit test for PDF state
then T011-T014 implementation
then T009 passes
```

---

## Implementation Strategy

### MVP (US1-US4 only)

1. Phase 2 Foundational
2. US1 PDF + US2 Image + US3 Video + US4 Text in parallel
3. Stop and validate each preview type independently

### Full P0 Core Parity

1. MVP complete
2. US5 Integration + Navigation + Version Preview
3. Phase 8 regression + docs
4. Ready for Version History UI (003) which reuses preview components

---

## Notes

- PDF.js loaded via CDN: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.x.x/pdf.min.mjs` (check latest stable)
- Prism.js loaded via CDN: `https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-core.min.js` + language components
- No backend changes required — all preview uses existing `/files/:id/download` signed URLs
- Version-specific preview needs backend support for `GET /files/:id/versions/:versionNumber/download` — coordinate with Version History UI (003)
- Reuse existing `Modal` component for `PreviewModal` wrapper
- Reuse existing `FileIcon` logic for file type detection in `FilePreview` orchestrator
- Keep preview components lazy-loaded (code splitting) to avoid bundle bloat