CURRENT PHASE: 06b

STATUS: COMPLETE — Version History UI implemented and tested

PREVIOUS: 06a — File Preview UI — PASS (`docs/releases/PHASE-06a-COMPLETION.md`)

OBJECTIVE:
Version History UI to browse, preview, and restore file versions + IMKAN One UI compliance.

COMPLETED THIS PHASE:
- T003–T006: Backend version endpoints (GET version download, POST restore-version) with ACL enforcement
- T007–T011: Frontend API client, VersionHistoryPanel, VersionList, VersionRow, i18n (EN/AR)
- T014–T019: VersionList component (virtualized, newest first), VersionRow (metadata, preview/restore), ActionDropdown integration
- T022–T025: Preview integration (reuse 06a PreviewModal with versionNumber), preview works for all MIME types
- T028–T032: RestoreConfirmModal, restore flow (confirmation, API call, refresh, audit log), VIEWER/current version restrictions
- T035–T038: Keyboard nav (Escape, Tab, Enter), ARIA live regions, RTL layout, version history route
- Backend unit tests: 169/169 PASS
- Backend e2e (IDOR + Team Folder ACL + Version): 48/48 PASS (18/18 IDOR + 28 ACL + 2 new)
- Frontend unit tests: 35/35 PASS
- Frontend typecheck: PASS
- Frontend production build: PASS

PHASE 06b GATES MET:
✅ Backend version endpoints with JWT auth, tenant isolation, canRead/canWrite enforcement
✅ Version download endpoint returns signed URL for specific version s3Key
✅ Restore endpoint creates new version (copies s3Key/size/mime/hash), preserves history, audit logged
✅ VersionHistoryPanel with focus trap, Escape close, keyboard nav, ARIA live region
✅ VersionList: newest first, metadata (version#, date, uploader, size, hash), preview/restore buttons
✅ Preview integration: reuse 06a PreviewModal with versionNumber prop, works for all MIME types
✅ Restore: confirmation modal, creates new version, preserves old versions, FILE_VERSION_RESTORED audit
✅ VIEWER/current version restrictions enforced (restore button hidden/disabled)
✅ Keyboard navigation: Escape close, Tab through rows, Enter/Space preview, Shift+Enter restore
✅ ARIA live region announcements for panel open/close, version preview, restore success/error
✅ Full EN/AR i18n with RTL layout
✅ Direct version history links via `/files/[fileId]/version-history` route
✅ IDOR 18/18 regression preserved
✅ Team Folder ACL 28/28 regression preserved
✅ No Docker/MinIO used; STORAGE_DRIVER=local

NEXT PHASE: 07 (if authorized)
