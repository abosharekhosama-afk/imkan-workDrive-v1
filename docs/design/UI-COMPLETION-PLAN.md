# UI Completion Plan: IMKAN One Compliance

This document outlines the concrete implementation plan to upgrade the IMKAN WorkDrive frontend from its current functional skeleton state to a visually complete, enterprise-grade **IMKAN One Design System** compliance state.

---

## Task Overview

| Task ID | Task Name | Affected Files | Dependencies |
| :--- | :--- | :--- | :--- |
| **UI-201** | Design Token & Utility Foundation | `imkan-tokens.css`, `globals.css` | None |
| **UI-202** | Local Dev Auth Toolbar | `dev-auth-toolbar.tsx`, `layout.tsx` | UI-201 |
| **UI-203** | High-Density `DataTable` & File Icons | `file-table.tsx`, `file-icon.tsx`, `action-dropdown.tsx` | UI-201 |
| **UI-204** | Accessible Modals & Toast Alerts | `modal.tsx`, `share-modal.tsx`, `toast.tsx` | UI-201 |
| **UI-205** | Enhanced `UploadZone` & Queue | `upload-zone.tsx` | UI-201 |
| **UI-206** | Empty States, Skeletons & Alert Banners | `empty-state.tsx`, `skeleton-loader.tsx`, `alert-banner.tsx` | UI-201 |
| **UI-207** | Team Folders UI & Role Badges | `team-folders/page.tsx`, `members-modal.tsx` | UI-203, UI-204 |
| **UI-208** | Responsive & Accessibility Polish | All frontend components | UI-201–UI-207 |

---

## Detailed Task Specifications

### Task UI-201: Design Token & CSS Utility Foundation
- **Status**: ✅ **PASS** (2026-08-19)
- **Objective**: Expand the fallback CSS token contract in `imkan-tokens.css` and declare standard IMKAN One utility classes in `globals.css`.
- **Files Affected**:
  - `frontend/src/styles/imkan-tokens.css`
  - `frontend/src/app/globals.css`
- **Implementation Requirements**:
  - Add tokens for border (`--imkan-color-border`), focus outline (`--imkan-color-focus`), hover surface (`--imkan-color-surface-hover`), error (`--imkan-color-error`), and success (`--imkan-color-success`).
  - Add CSS utility classes: `.imkan-button`, `.imkan-input`, `.imkan-card`, `.imkan-badge`.
- **Actual Implementation** (conservative approach — no authoritative values available):
  - Added `--imkan-color-border` as semantic alias of `var(--imkan-color-muted)` — FALLBACK.
  - Added `--imkan-color-focus` as semantic alias of `var(--imkan-color-primary)` — FALLBACK.
  - Did NOT add `--imkan-color-error`, `--imkan-color-success`, `--imkan-color-warning`, `--imkan-color-surface-hover` — no authoritative values exist.
  - Added Tailwind `@theme inline` bindings for `--color-muted`, `--color-surface`, `--color-border`, `--color-focus`.
  - Added 18 semantic CSS utility classes: `.imkan-page`, `.imkan-panel`, `.imkan-divider`, `.imkan-heading`, `.imkan-muted`, `.imkan-meta`, `.imkan-button`, `.imkan-button-secondary`, `.imkan-button-destructive`, `.imkan-input`, `.imkan-select`, `.imkan-table`, `.imkan-table-row`, `.imkan-badge`, `.imkan-alert`, `.imkan-modal-backdrop`, `.imkan-modal-surface`, `.imkan-focusable`.
  - All utilities use only existing tokens — no hardcoded colors.
  - Enhanced documentation comments with fallback/authority annotations.
  - `@imkan/design-system` NPM package confirmed NOT available locally.
- **Acceptance Criteria**:
  - All form controls and buttons consume CSS variable design tokens without hardcoded hex values. ✅
  - Light and dark modes render cleanly with cohesive contrast. ✅
- **Definition of Done**: `npm run typecheck`, `npm test`, and `npm run build` pass. ✅
- **Completion Document**: `docs/design/UI-201-COMPLETION.md`

---

### Task UI-202: Local Development Auth Toolbar (`DevAuthToolbar`)
- **Status**: ✅ **PASS** (implementation, tests, typecheck, and production build complete)
- **Objective**: Provide a non-production developer toolbar component to safely set the existing development token during local development, allowing instant browser inspection of populated UI states.
- **Files Affected**:
  - `frontend/src/components/dev-auth-toolbar.tsx`
  - `frontend/src/app/layout.tsx`
- **Implementation Requirements**:
  - Rendered ONLY when `process.env.NODE_ENV !== "production"`.
  - Buttons for "Org Admin", "Member/Organizer", "Clear Token".
  - Automatically reloads current page or triggers state reload on token change.
- **Acceptance Criteria**:
  - Visiting `http://localhost:3000` in local dev mode allows setting the existing token without manually opening DevTools.
  - Strictly inactive in production builds.
- **Definition of Done**: Builds clean in production (`npm run build`). ✅

---

### Task UI-203: High-Density `DataTable` Component & File Icons
- **Status**: ✅ **PASS** (implemented, tested, typechecked, and production-built)
- **Objective**: Upgrade `file-table.tsx` to a rich, high-density enterprise table featuring file type icons, metadata columns, and an action context menu dropdown.
- **Files Affected**:
  - `frontend/src/components/file-table.tsx`
  - `frontend/src/components/file-icon.tsx` (New)
  - `frontend/src/components/action-dropdown.tsx` (New)
- **Implementation Requirements**:
  - Render file/folder type icons based on MIME type or extension.
  - Display metadata columns: Owner, Last Modified, File Size.
  - Replace inline text buttons with a unified `...` action dropdown menu (`Share`, `Download`, `Rename`, `Delete`).
  - Maintain VIEWER role restrictions (hide mutate/share actions when `canMutate` or `canShare` is false).
- **Acceptance Criteria**:
  - Table matches IMKAN One 14/12/10px enterprise scale.
  - VIEWER role hides disallowed items inside the action menu.
- **Definition of Done**: Frontend unit tests pass (`npm test`). ✅

---

### Task UI-204: Accessible Modals & Toast Alerts
- **Status**: ✅ **PASS** (implementation, tests, typecheck, and production build complete)
- **Objective**: Standardize `ShareModal`, `RenameModal`, `DeleteModal`, and `MembersModal` using a shared accessible `Modal` dialog component with toast notification support.
- **Files Affected**:
  - `frontend/src/components/modal.tsx` (New)
  - `frontend/src/components/toast.tsx` (New)
  - `frontend/src/components/share-modal.tsx`
  - `frontend/src/components/rename-modal.tsx`
  - `frontend/src/components/delete-modal.tsx`
  - `frontend/src/components/members-modal.tsx`
- **Implementation Requirements**:
  - Accessible modal container with backdrop blur/darkening, `role="dialog"`, `aria-modal="true"`, and `Escape` key close listener.
  - "Copy Share Link" button inside `ShareModal` that copies URL to clipboard and triggers a success Toast alert ("Link copied to clipboard").
- **Acceptance Criteria**:
  - Pressing `Escape` closes any open modal.
  - Copying share link gives immediate visual toast feedback.
- **Definition of Done**: Frontend unit tests pass. ✅
- **Completion Document**: `docs/design/UI-204-COMPLETION.md`

---

### Task UI-205: Enhanced Upload Experience (`UploadZone` & Queue)
- **Status**: ✅ **PASS** (implementation, tests, typecheck, and production build complete)
- **Objective**: Enhance `upload-zone.tsx` with a visual drop backdrop highlight, upload progress indicator, and batch upload status feedback.
- **Files Affected**:
  - `frontend/src/components/upload-zone.tsx`
- **Implementation Requirements**:
  - Highlight drop target with primary token color during drag-over.
  - Render progress bar during multi-step sha256 calculation and request upload.
  - Render toast notification on upload completion.
- **Acceptance Criteria**:
  - Visual feedback provided throughout the upload lifecycle.
- **Definition of Done**: Existing `upload-file.spec.ts` passes. ✅
- **Completion Document**: `docs/design/UI-205-COMPLETION.md`

---

### Task UI-206: Illustrated Empty States, Skeleton Loaders & Error Banners
- **Status**: ✅ **PASS** (implementation, tests, typecheck, and production build complete)
- **Objective**: Replace plain-text loading, empty, and error messages with styled IMKAN One UI feedback components.
- **Files Affected**:
  - `frontend/src/components/empty-state.tsx` (New)
  - `frontend/src/components/skeleton-loader.tsx` (New)
  - `frontend/src/components/alert-banner.tsx` (New)
  - `frontend/src/components/file-browser.tsx`
  - `frontend/src/app/files/trash/page.tsx`
  - `frontend/src/app/files/activity/page.tsx`
  - `frontend/src/app/files/team-folders/page.tsx`
- **Implementation Requirements**:
  - `SkeletonLoader` renders 3-5 pulsing animated table rows while `load()` promises are pending.
  - `EmptyState` displays an icon, title, description, and action button (e.g., "Upload File" or "Create Folder") when lists contain 0 items.
  - `AlertBanner` displays styled error banners for 401, 403, and 500 API responses.
- **Acceptance Criteria**:
  - Zero abrupt layout shifts during page loading.
  - Clear, helpful empty states across Files, Team Folders, Trash, and Activity.
- **Definition of Done**: Frontend build and tests pass. ✅
- **Completion Document**: `docs/design/UI-206-COMPLETION.md`

---

### Task UI-207: Team Folders UI & Role Badges
- **Objective**: Upgrade the Team Folders directory page and member management dialog with pill badges and role descriptions.
- **Files Affected**:
  - `frontend/src/app/files/team-folders/page.tsx`
  - `frontend/src/components/members-modal.tsx`
- **Implementation Requirements**:
  - Role badges (`Admin`, `Organizer`, `Editor`, `Viewer`) rendered as colored pill badges using design tokens.
  - Members count badge displayed on each Team Folder card/row.
  - Member management dialog displays role dropdowns and user email search.
- **Acceptance Criteria**:
  - Role permissions are visually distinct.
- **Definition of Done**: Frontend unit tests pass.

---

### Task UI-208: Responsive & Accessibility Polish
- **Objective**: Finalize responsive breakpoints and keyboard navigation across all views.
- **Files Affected**:
  - All components in `frontend/src/components/` and `frontend/src/app/`
- **Implementation Requirements**:
  - Mobile responsive wrapper for `DataTable` allowing horizontal scroll or stacked card view on viewports < 640px.
  - Focus ring indicator (`--imkan-color-focus`) visible on all interactive elements during keyboard navigation.
- **Acceptance Criteria**:
  - App is fully navigable via Keyboard (`Tab`, `Enter`, `Escape`, `Space`).
  - No horizontal overflow breaks page layout on mobile screens.
- **Definition of Done**: `npm run typecheck`, `npm test`, and `npm run build` pass with 100% success.
