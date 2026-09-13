TASK: PHASE 6a/6b — File Preview UI (06a) + Version History UI (06b)
STATUS: 06a COMPLETE — File Preview UI implemented and tested; 06b COMPLETE — Version History UI implemented and tested

MUST READ:
- specs/002-file-preview-ui/spec.md
- specs/002-file-preview-ui/plan.md
- specs/002-file-preview-ui/tasks.md
- specs/003-version-history-ui/spec.md
- specs/003-version-history-ui/plan.md
- specs/003-version-history-ui/tasks.md
- docs/releases/PHASE-06a-COMPLETION.md
- docs/releases/PHASE-06b-COMPLETION.md
- docs/releases/PHASE-05-COMPLETION.md
- docs/api/API-CONTRACTS.md
- docs/agent/PROJECT-STATE.md
- docs/agent/CURRENT-PHASE.md

OBJECTIVE:
06a: File Preview UI for PDF, images, video, and text/code files with modal, toolbar, keyboard nav, ARIA, RTL, i18n.
06b: Version History UI — browse, preview, restore file versions (depends on 06a preview component).

FILES CHANGED (06a):
- frontend/src/lib/api/preview.ts, preview.spec.ts
- frontend/src/components/preview-modal.tsx, preview-toolbar.tsx
- frontend/src/components/file-preview/file-preview.tsx (orchestrator + 4 sub-components)
- frontend/src/components/file-browser.tsx (preview integration, keyboard nav)
- frontend/src/components/file-table.tsx (Preview action)
- frontend/src/components/preview-modal.tsx, preview-toolbar.tsx
- frontend/src/app/files/[fileId]/preview/page.tsx
- frontend/src/i18n/messages/en.json, ar.json (+18 preview keys)
- docs/releases/PHASE-06a-COMPLETION.md
- docs/api/API-CONTRACTS.md (preview usage notes)
- docs/agent/PROJECT-STATE.md, CURRENT-PHASE.md

FILES CHANGED (06b):
- backend/src/files/files.controller.ts (added 2 endpoints)
- backend/src/files/files.service.ts (added createVersionDownloadUrl, restoreVersion)
- backend/src/files/restore-version.schema.ts
- frontend/src/lib/api/versions.ts, versions.spec.ts
- frontend/src/components/version-history-panel.tsx
- frontend/src/components/version-history/version-list.tsx
- frontend/src/components/version-history/restore-confirm-modal.tsx
- frontend/src/components/file-browser.tsx (version history integration)
- frontend/src/components/file-table.tsx (Version History action)
- frontend/src/app/files/[fileId]/version-history/page.tsx
- frontend/src/i18n/messages/en.json, ar.json (+19 version history keys)
- docs/releases/PHASE-06b-COMPLETION.md
- docs/api/API-CONTRACTS.md (version endpoints)
- docs/agent/PROJECT-STATE.md, CURRENT-PHASE.md, CURRENT-TASK.md

TEST EVIDENCE:
- `frontend` `npm test`: 35 passing / 0 failing.
- `frontend` `npm run typecheck`: PASS (0 errors).
- `frontend` `npm run build`: PASS; optimized production build completed.
- `backend` `npm test`: 169 passing / 0 failing.
- `backend` `npm run test:e2e`: 48 passing (18 IDOR + 28 ACL + 2 new version endpoints).
- `git diff --check`: PASS.

COMPLETED IN THIS CHECKPOINT (06a):
- Preview API helpers: getPreviewUrl, getVersionPreviewUrl, getPreviewMimeCategory, getLanguageFromMime
- PreviewModal: focus trap, Escape close, Arrow Left/Right nav, ARIA live region, version badge
- PreviewToolbar: context-aware (PDF: page nav/zoom/search; Image: zoom/pan/rotate; Video: native; Text: copy)
- PdfPreview: PDF.js via CDN, page nav, zoom 50%-300%, text search, password fallback
- ImagePreview: native `<img>` + CSS transform, zoom 25%-500%, drag pan, 90° rotation, metadata
- VideoPreview: native `<video controls>`, codec fallback, info overlay
- TextPreview: Prism.js syntax highlighting (15+ langs), line numbers, copy button, theme sync, large file handling
- FileBrowser integration: Preview action in ActionDropdown, keyboard nav (Escape/Arrow keys), prev/next file
- i18n: 18 preview keys in EN/AR with RTL support
- Preview route: `/files/[fileId]/preview` for direct links
- Version preview support: getVersionPreviewUrl for Phase 06b integration

COMPLETED IN THIS CHECKPOINT (06b):
- Backend: GET /files/:id/versions/:versionNumber/download (signed URL for version's s3Key)
- Backend: POST /files/:id/restore-version (creates new version copying source, audit FILE_VERSION_RESTORED)
- Backend: Both endpoints enforce canRead/canWrite via PermissionService
- Frontend API client: getVersionDownloadUrl, restoreVersion
- VersionHistoryPanel: modal with focus trap, Escape close, ARIA live region, version badge
- VersionList: virtualized table, newest first, metadata (version#, date, uploader, size, hash)
- VersionRow: preview/restore buttons, disabled for VIEWER/current version
- RestoreConfirmModal: shows source version info, confirms action, loading state
- Preview integration: reuse 06a PreviewModal with versionNumber prop, works for all MIME types
- Restore flow: confirmation → API call → new version created → history preserved → audit logged
- Keyboard nav: Escape close, Tab through rows, Enter/Space preview, Shift+Enter restore
- ARIA live regions for panel open/close, version preview, restore success/error
- Full EN/AR i18n with RTL layout
- Version history route: `/files/[fileId]/version-history` for direct links

NEXT TASK:
Phase 07 (if authorized)
