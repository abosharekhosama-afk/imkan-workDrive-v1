# TASKS.md — IMKAN WorkDrive Task Tracker

> Auto-generated baseline spec. Lists current functional components and pending tasks/improvements. Update this file as work progresses.

---

## 1. Functional Components (Current State)

### Frontend Pages (App Router)
| Route | Component | Status |
|-------|-----------|--------|
| `/` | Redirect to `/auth/login` | ✅ Working |
| `/auth/login` | Login page | ✅ Working |
| `/auth/signup` | Signup page | ✅ Working |
| `/auth/forgot-password` | Forgot password page | ✅ Working |
| `/auth/reset-password` | Reset password form | ✅ Working |
| `/auth/callback` | OAuth callback | ✅ Working |
| `/files` | Root file browser | ✅ Working |
| `/files/[folderId]` | Folder contents view | ✅ Working |
| `/files/recent` | Recent files | ✅ Working |
| `/files/favorites` | Favorites view | ✅ Working |
| `/files/shared-with-me` | Shared with me | ✅ Working |
| `/files/shared-links` | Shared links | ✅ Working |
| `/files/team-folders` | Team folders | ✅ Working |
| `/files/trash` | Trash view | ✅ Working |
| `/files/activity` | Activity feed | ✅ Working |
| `/files/fileId/preview` | File preview | ✅ Working |
| `/notifications` | Notifications | ✅ Working |
| `/organization` | Organization management | ✅ Working |
| `/settings` | User settings | ✅ Working |
| `/share/public` | Public share | ✅ Working |
| `/admin` | Admin dashboard | ✅ Working |

### Frontend Components (Key)
| Component | File | Status |
|-----------|------|--------|
| File Browser | `components/file-browser.tsx` | ✅ Working |
| File Table | `components/file-table.tsx` | ✅ Working |
| File Grid View | `components/file-grid-view.tsx` | ✅ Working |
| File Preview Modal | `components/file-preview-modal.tsx` | ✅ Working |
| Version History Drawer | `components/files/version-history-drawer.tsx` | ✅ Working |
| Primary Sidebar | `components/layout/primary-sidebar.tsx` | ✅ Working |
| Top Header | `components/layout/top-header.tsx` | ✅ Working |
| Inspector Panel | `components/layout/inspector.tsx` | ✅ Working |
| Shell Context | `components/layout/shell-context.tsx` | ✅ Working |
| Global Search | `components/global-search.tsx` | ✅ Working |
| Upload Zone | `components/upload-zone.tsx` | ✅ Working |
| Share Modal | `components/share-modal.tsx` | ✅ Working |
| Move Modal | `components/move-modal.tsx` | ✅ Working |
| Rename Modal | `components/rename-modal.tsx` | ✅ Working |
| Delete Modal | `components/delete-modal.tsx` | ✅ Working |
| Breadcrumbs | `components/breadcrumbs.tsx` | ✅ Working |
| Auth Gate | `components/auth-gate.tsx` | ✅ Working |
| Theme Toggle | `components/theme-toggle.tsx` | ✅ Working |
| Toast | `components/toast.tsx` | ✅ Working |
| Skeleton Loader | `components/skeleton-loader.tsx` | ✅ Working |
| Empty State | `components/empty-state.tsx` | ✅ Working |
| Members Modal | `components/members-modal.tsx` | ✅ Working |
| Org Switcher | `components/org-switcher.tsx` | ✅ Working |
| Storage Indicator | `components/storage-indicator.tsx` | ✅ Working |
| File Icon | `components/file-icon.tsx` | ✅ Working |
| File Actions Menu | `components/file-actions-menu.tsx` | ✅ Working |
| File Context Menu | `components/file-context-menu.tsx` | ✅ Working |
| File Details Modal | `components/file-details-modal.tsx` | ✅ Working |
| PDF Viewer | `components/preview/pdf-viewer.tsx` | ✅ Working |
| Image Viewer | `components/preview/image-viewer.tsx` | ✅ Working |
| Code Viewer | `components/preview/code-viewer.tsx` | ✅ Working |
| Media Viewer | `components/preview/media-viewer.tsx` | ✅ Working |
| Office Viewer | `components/preview/office-viewer.tsx` | ✅ Working |
| Archive Viewer | `components/preview/archive-viewer.tsx` | ✅ Working |
| Version History Panel | `components/version-history-panel.tsx` | ✅ Working |
| Version List | `components/version-history/version-list.tsx` | ✅ Working |
| Restore Confirm Modal | `components/version-history/restore-confirm-modal.tsx` | ✅ Working |
| Locale Provider | `components/locale-provider.tsx` | ✅ Working |
| Workdrive Content | `components/workdrive-content.tsx` | ✅ Working |
| Global Preview Host | `components/global-preview-host.tsx` | ✅ Working |
| Modal | `components/modal.tsx` | ✅ Working |
| Preview Toolbar | `components/preview-toolbar.tsx` | ✅ Working |
| Action Dropdown | `components/action-dropdown.tsx` | ✅ Working |
| Alert Banner | `components/alert-banner.tsx` | ✅ Working |
| Dev Auth Toolbar | `components/dev-auth-toolbar.tsx` | ✅ Working |


---

## 2. Backend Modules (NestJS)
| Module | Controller | Service | Status |
|--------|-----------|---------|--------|
| Auth | `auth.controller.ts` | `auth.service.ts` | ✅ Working |
| Files | `files.controller.ts` | `files.service.ts` | ✅ Working |
| Folders | `folders.controller.ts` | `folders.service.ts` | ✅ Working |
| Storage | `storage-objects.controller.ts` | `local-disk.storage.ts` / `s3-compatible.storage.ts` | ✅ Working |
| Shares | `shares.controller.ts` | `shares.service.ts` | ✅ Working |
| Search | `search.controller.ts` | `search.service.ts` | ✅ Working |
| Audit | `audit.controller.ts` | `audit.service.ts` | ✅ Working |
| Team Folders | `team-folders.controller.ts` | `team-folders.service.ts` | ✅ Working |
| Favorites | `favorites.controller.ts` | `favorites.service.ts` | ✅ Working |
| Recent | `recent.controller.ts` | `recent.service.ts` | ✅ Working |
| Notifications | `notifications.controller.ts` | `notifications.service.ts` | ✅ Working |
| Comments | `comments.controller.ts` | `comments.service.ts` | ✅ Working |
| Quota | `quota.controller.ts` | `quota.service.ts` | ✅ Working |
| Admin | `admin.controller.ts` + `enterprise.controller.ts` | `admin.service.ts` + `enterprise.service.ts` | ✅ Working |
| Organization | `organization.controller.ts` | `organization.service.ts` | ✅ Working |
| Folder Permissions | `folder-permissions.controller.ts` | `folder-permissions.service.ts` | ✅ Working |
| Permissions | — | `permission.service.ts` | ✅ Working |
| Prisma | — | `prisma.service.ts` | ✅ Working |

---

## 3. Immediate Pending Tasks / Improvements

### High Priority
| ID | Task | Category | Notes |
|----|------|----------|-------|
| T-001 | Install official `@imkan/design-system` package | Design | Replace fallback tokens with authoritative values |
| T-002 | Add Zoho Puvi + IBM Plex Sans Arabic fonts | Design | Replace system-ui fallbacks when font packages available |
| T-003 | Replace hardcoded colors with IMKAN tokens | Design | Audit globals.css for non-token color values |
| T-004 | Implement file upload retry logic | Resilience | Handle network failures during chunked upload |
| T-005 | Add proper error boundary components | Resilience | React error boundaries for graceful failure |

### Medium Priority
| ID | Task | Category | Notes |
|----|------|----------|-------|
| T-006 | Complete test coverage for all modules | Testing | Many spec files exist but coverage gaps remain |
| T-007 | Add loading states for all async operations | UX | Consistent skeleton/spinner patterns |
| T-008 | Implement drag-and-drop file reorganization | Feature | Move files via drag in grid/table view |
| T-009 | Add keyboard shortcuts overlay | UX | Power-user shortcut reference panel |
| T-010 | Implement offline detection + queue | Resilience | Handle network loss gracefully |
| T-011 | Add bulk download functionality | Feature | Multi-file/folder download as zip |
| T-012 | Improve mobile responsiveness | UX | Polish touch interactions on small screens |
| T-013 | Add file type icons for more formats | Design | Extend file-icon logic for additional MIME types |

### Low Priority
| ID | Task | Category | Notes |
|----|------|----------|-------|
| T-014 | Add analytics/telemetry | Observability | Track feature usage and errors |
| T-015 | Implement file tagging system | Feature | User-defined tags beyond folders |
| T-016 | Add custom folder icons | Design | User-selectable folder colors/icons |
| T-017 | Implement file comments UI | Feature | Backend exists, frontend pending |
| T-018 | Add data export functionality | Feature | GDPR/personal data export |
| T-019 | Optimize bundle size | Performance | Code splitting, lazy loading |
| T-020 | Add service worker for caching | Performance | PWA capabilities |

### Technical Debt
| ID | Task | Category | Notes |
|----|------|----------|-------|
| TD-001 | Remove `ignoreBuildErrors: true` from next.config.ts | Quality | Fix TypeScript build errors properly |
| TD-002 | Clean up zoho-*.mjs audit scripts | Maintenance | Move to scripts/ directory or remove |
| TD-003 | Standardize error handling consistency | Quality | Some API modules throw raw Errors vs ApiError |
| TD-004 | Remove unused CSS classes | Performance | Audit globals.css for dead styles |
| TD-005 | Add proper input validation on all forms | Security | Zod schemas exist but not all forms use them |

---

## 4. Recently Completed (from specs/)
| Spec | Description | Status |
|------|-------------|--------|
| 001 | Team Folders ACL | ✅ Implemented |
| 002 | File Preview UI | ✅ Implemented |
| 003 | Version History UI | ✅ Implemented |

---

*Generated: 206-09-12 from commit 9472ff6 on branch v2-release*
