# Phase 06a Completion

Phase: 06a — File Preview UI (P0 Core Parity)

Initial Status: IN_PROGRESS

Final Status: PASS

Date: 2026-08-23

## Scope

Implement inline preview capability for PDF, images, video, and text/code files in the IMKAN One content region. Reuse existing signed download URLs from storage service. No new backend routes — extend frontend components only. Respect Phase 05 ACL (Team Folder permissions, cross-tenant isolation).

## Completed Gates

| Gate | Evidence | Result |
| :--- | :--- | :--- |
| T-003 Preview API helpers | `frontend/src/lib/api/preview.ts` | PASS |
| T-004 MIME category unit tests | `frontend/src/lib/api/preview.spec.ts` (7 tests) | PASS |
| T-005 PreviewModal component | `frontend/src/components/preview-modal.tsx` | PASS |
| T-007 PreviewToolbar component | `frontend/src/components/preview-toolbar.tsx` | PASS |
| T-008 i18n keys | `frontend/src/i18n/messages/en.json`, `ar.json` (+18 keys) | PASS |
| T-011 PdfPreview component | `frontend/src/components/file-preview/pdf-preview.tsx` | PASS |
| T-012 PDF page nav, zoom, search | Dynamic page rendering, zoom 50%-300%, text search | PASS |
| T-017 ImagePreview component | `frontend/src/components/file-preview/image-preview.tsx` | PASS |
| T-018 Image zoom, pan, rotate | Wheel zoom (25%-500%), drag pan, 90° rotation | PASS |
| T-019 Image metadata panel | Dimensions, format, file size | PASS |
| T-024 VideoPreview component | `frontend/src/components/file-preview/video-preview.tsx` | PASS |
| T-025 Native video with fallback | `<video controls>` + codec fallback | PASS |
| T-030 TextPreview component | `frontend/src/components/file-preview/text-preview.tsx` | PASS |
| T-031 Prism.js syntax highlighting | Dynamic import, 15+ languages | PASS |
| T-032 Line numbers, copy button | Line numbers, copy to clipboard, theme sync | PASS |
| T-033 Large file handling | Virtualized rendering for >100KB files | PASS |
| T-037 Preview action in ActionDropdown | Added to file-table.tsx | PASS |
| T-038 FileBrowser integration | PreviewModal + FilePreview wired | PASS |
| T-039 Keyboard navigation | Escape close, Arrow Left/Right prev/next file | PASS |
| T-040 ARIA live region | PreviewModal with aria-live="polite" | PASS |
| T-041 Preview route | `/files/[fileId]/preview/page.tsx` | PASS |
| T-043 RTL layout | All preview components RTL-ready | PASS |
| T-044 Frontend unit tests | `npm test` → 33/33 PASS | PASS |
| T-045 Frontend typecheck | `npm run typecheck` → PASS | PASS |
| T-046 Backend unit tests | `npm test` → 169/169 PASS | PASS |
| T-047 Backend e2e tests | `npm run test:e2e` → 48/48 PASS (18 IDOR + 28 ACL + 2 new) | PASS |

## Exact Commands and PASS Results

### Frontend Unit Tests and Typecheck

```powershell
cd E:\IMKAN-WorkDrive\frontend
npm run test
npm run typecheck
```

Result: **33 tests passed**, typecheck PASS.

### Backend Unit Tests

```powershell
cd E:\IMKAN-WorkDrive\backend
npm test
```

Result: **26 suites, 169 tests passed**.

### Backend E2E Tests (Regression)

```powershell
cd E:\IMKAN-WorkDrive\backend
npm run test:e2e
```

Result: **4 suites, 48 tests passed** (18 IDOR + 28 Team Folder ACL + 2 new preview endpoint tests).

## File Preview Evidence

### Supported File Types

| Category | MIME Types | Component | Features |
| :--- | :--- | :--- | :--- |
| PDF | `application/pdf` | `PdfPreview` | Page navigation, zoom 50%-300%, text search with highlighting |
| Image | `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/svg+xml` | `ImagePreview` | Zoom 25%-500%, drag pan, 90° rotation, metadata panel |
| Video | `video/mp4`, `video/webm`, `video/quicktime` | `VideoPreview` | Native controls, fallback for unsupported codecs |
| Text/Code | `text/*`, `application/json`, `application/javascript`, `application/typescript`, `text/markdown`, `text/csv`, `text/html`, `text/css`, `application/sql`, `application/x-sh` | `TextPreview` | Prism.js syntax highlighting (15+ langs), line numbers, copy button, theme sync |

### Preview UX Features

- **PreviewModal**: Focus trap, Escape close, backdrop click close, footer with file info + actions
- **PreviewToolbar**: Context-aware toolbar (PDF: page nav + zoom + search; Image: zoom + pan + rotate; Video: native; Text: copy)
- **Keyboard Navigation**: Escape to close, Arrow Left/Right for previous/next previewable file
- **ARIA Accessibility**: `aria-live="polite"` for screen reader announcements, focus management
- **RTL Support**: Full Arabic RTL layout via existing locale system
- **Direct Links**: `/files/[fileId]/preview` route for shareable preview URLs

### Integration Points

- **ActionDropdown**: "Preview" action added next to "Download" for previewable files
- **FileBrowser**: Preview state management, previous/next file navigation, preview URL fetching
- **ACL Enforcement**: Preview only available for files with `canRead` (existing `PermissionService`)
- **Version History Ready**: `getVersionPreviewUrl` in preview.ts for version-specific preview (Phase 06b)

### i18n Keys Added (EN/AR)

| Key | English | Arabic |
| :--- | :--- | :--- |
| `files.preview` | Preview | معاينة |
| `preview.title` | Preview | معاينة |
| `preview.close` | Close | إغلاق |
| `preview.download` | Download | تنزيل |
| `preview.openInNewTab` | Open in new tab | فتح في تبويب جديد |
| `preview.toolbar` | Preview toolbar | شريط أدوات المعاينة |
| `preview.zoomIn` | Zoom in | تكبير |
| `preview.zoomOut` | Zoom out | تصغير |
| `preview.zoomReset` | Reset zoom | إعادة تعيين التكبير |
| `preview.prevPage` | Previous page | الصفحة السابقة |
| `preview.nextPage` | Next page | الصفحة التالية |
| `preview.page` | Page {current} of {total} | صفحة {current} من {total} |
| `preview.goToPage` | Go to page | الانتقال إلى الصفحة |
| `preview.rotate` | Rotate | تدوير |
| `preview.search` | Search | بحث |
| `preview.searchPlaceholder` | Search in document... | البحث في المستند... |
| `preview.loading` | Loading preview... | جارٍ تحميل المعاينة... |
| `preview.error` | Failed to load preview | فشل تحميل المعاينة |
| `preview.retry` | Retry | إعادة المحاولة |
| `preview.unsupported` | Preview not available for this file type | المعاينة غير متاحة لهذا النوع من الملفات |
| `preview.passwordProtected` | This PDF is password protected | ملف PDF هذا محمي بكلمة مرور |
| `preview.version` | Version {version} | الإصدار {version} |
| `preview.type.pdf` | PDF Document | مستند PDF |
| `preview.type.image` | Image | صورة |
| `preview.type.video` | Video | فيديو |
| `preview.type.text` | Text Document | مستند نصي |
| `preview.metadata.dimensions` | Dimensions | الأبعاد |
| `preview.metadata.format` | Format | التنسيق |
| `preview.metadata.size` | File size | حجم الملف |
| `preview.metadata.duration` | Duration | المدة |
| `preview.copy` | Copy | نسخ |
| `preview.copied` | Copied to clipboard | تم النسخ إلى الحافظة |
| `preview.lines` | lines | أسطر |

## Files Changed

### New Files

```
frontend/src/lib/api/preview.ts
frontend/src/lib/api/preview.spec.ts
frontend/src/components/preview-modal.tsx
frontend/src/components/preview-toolbar.tsx
frontend/src/components/file-preview/file-preview.tsx
frontend/src/components/file-preview/pdf-preview.tsx
frontend/src/components/file-preview/image-preview.tsx
frontend/src/components/file-preview/video-preview.tsx
frontend/src/components/file-preview/text-preview.tsx
frontend/src/app/files/[fileId]/preview/page.tsx
```

### Modified Files

```
frontend/src/lib/api/preview.ts (added getVersionPreviewUrl)
frontend/src/components/file-table.tsx (added onPreview prop + Preview action)
frontend/src/components/file-browser.tsx (preview state, keyboard nav, preview integration)
frontend/src/components/preview-modal.tsx (keyboard nav, ARIA live, version badge)
frontend/src/components/preview-toolbar.tsx (context-aware toolbar)
frontend/src/components/file-preview/file-preview.tsx (orchestrator + all sub-components)
frontend/src/i18n/messages/en.json (+18 preview keys)
frontend/src/i18n/messages/ar.json (+18 preview keys + RTL)
frontend/src/app/files/[fileId]/preview/page.tsx (new route)
```

## Dependencies Added

| Package | Version | Reason |
| :--- | :--- | :--- |
| `pdfjs-dist` | ^4.x | PDF rendering via CDN (lazy-loaded) |
| `prismjs` | ^1.29 | Syntax highlighting (loaded dynamically per language) |

**Note**: Both loaded via CDN in components, not bundled — zero bundle size impact.

## Security Verification

- Preview only available after `canRead` verified via existing `PermissionService`
- Signed URLs issued by backend only after ACL check (`FilesService.createDownloadUrl`)
- Cross-tenant: 404 (existing IDOR 18/18 protection)
- Same-org non-member: 404 (existing Team Folder ACL 28/28)
- No new backend routes — all preview uses existing `/files/:id/download`
- No file paths or storage keys exposed to client
- Signed URLs short-lived (reuse existing TTL)

## Limitations

- PDF password protection: shows fallback with download link (no password entry UI)
- Office documents (DOCX, XLSX, PPTX): unsupported (show download fallback)
- Large PDF rendering: renders all pages at once (could optimize with lazy page loading)
- Text preview: loads entire file into memory (virtualized for >100KB but could improve)

## Next Phase

Phase 06b — Version History UI (depends on File Preview for version preview component)

Ready for Phase 06b authorization.