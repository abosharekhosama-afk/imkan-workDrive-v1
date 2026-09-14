# Research: File Preview UI

**Feature**: File Preview UI
**Branch**: `002-file-preview-ui`
**Date**: 2026-08-23

## Technology Choices

### PDF Rendering: PDF.js
- **Decision**: Use PDF.js via CDN (lazy-loaded)
- **Rationale**: Industry standard, no backend dependency, works with signed URLs, supports text search, zoom, page navigation
- **Alternatives considered**: 
  - Native `<embed>`/`<iframe>` — limited controls, no text search, inconsistent across browsers
  - pdfjs-dist npm package — increases bundle size; CDN loading keeps main bundle small
  - Server-side PDF → image conversion — requires backend service, adds latency

### Image Preview: Native `<img>` + CSS Transform
- **Decision**: Native `<img>` with CSS `transform: scale()` for zoom, `transform: translate()` for pan
- **Rationale**: Zero dependencies, hardware accelerated, supports all image formats including SVG
- **Features**: Wheel zoom (25%-500%), drag pan, 90° rotation, metadata display

### Video Preview: Native `<video>`
- **Decision**: Native HTML5 `<video controls preload="metadata">`
- **Rationale**: Browser handles codec support, streaming, fullscreen; fallback to download link for unsupported
- **Supported**: MP4 (H.264), WebM (VP8/VP9/VP10)

### Syntax Highlighting: Prism.js
- **Decision**: Prism.js via CDN (dynamic import per language)
- **Rationale**: Lightweight (~2KB core), extensive language support, line numbers plugin, themeable via CSS variables
- **Alternatives considered**:
  - Shiki — more accurate but heavier, requires WASM
  - Highlight.js — similar to Prism, slightly larger
  - Monaco Editor — overkill for read-only preview

### State Management: React useState + Context
- **Decision**: Local component state for preview session; no global store needed
- **Rationale**: Preview is ephemeral, single-file, no cross-component sharing

## Integration Points

### Existing Backend Endpoints
- `GET /files/:id/download` → returns signed URL usable for `<iframe src>`, `<img src>`, `<video src>`, `fetch()`
- `GET /files/:id` → returns file metadata including `mimeType`, `size`, `versions[]`

### Existing Frontend Components
- `Modal` — focus trap, Escape close, backdrop click, ARIA dialog
- `ActionDropdown` — file row actions (add "Preview" next to "Download")
- `FileBrowser` — parent component, manages file list state
- `i18n` — `useLocale()`, `label()` for EN/AR with RTL
- `ApiClient` — `apiRequest()`, `getAccessToken()`, error handling

### File Preview (002) → Version History (003) Integration
- `PreviewModal` accepts optional `versionNumber` prop
- `FilePreview` orchestrator detects MIME, renders sub-component
- Version history panel calls `getVersionDownloadUrl(fileId, versionNumber)` for preview

## Performance Considerations

### Lazy Loading
- PDF.js: dynamic import only when PDF preview opens
- Prism.js: dynamic import only when text preview opens, per-language components
- Video/Image: native elements, no extra JS

### Large Files
- PDF: PDF.js renders pages on-demand (lazy page loading)
- Text: Virtualized rendering for >1000 lines (react-window or simple windowing)
- Video: `preload="metadata"` only

### Memory
- Preview components unmount on close (React cleanup)
- Signed URLs not cached beyond session (TTL ~5 min)

## Security Verification

### ACL Enforcement
- Preview only opens after `canRead` verified via existing file detail API
- Signed URL issued by backend only after `PermissionService.canRead()` check
- Cross-tenant: 404 (existing IDOR protection)
- Same-org non-member: 404 (existing Team Folder ACL)

### No New Attack Surface
- No new backend routes (002) / minimal 2 routes (003)
- No file paths exposed to client
- Signed URLs short-lived, capability-based

## Arabic RTL Support

### Existing Infrastructure
- `LocaleProvider` with `dir` attribute on `<html>`
- `label()` function returns localized strings
- CSS uses logical properties (`margin-inline-start`, `padding-inline-end`)

### Preview-Specific RTL
- Toolbar: buttons reverse order (close on left in RTL)
- PDF: PDF.js sidebar on right in RTL (configure via `locale`)
- Image/Video: controls native (browser handles RTL)
- Text: Prism.js code LTR (code always LTR), line numbers on right in RTL

## Decisions Summary

| Area | Decision | Rationale |
| :--- | :--- | :--- |
| PDF | PDF.js CDN | Standard, no backend, full features |
| Image | Native `<img>` + CSS | Zero dep, hardware accel |
| Video | Native `<video>` | Browser handles codecs |
| Syntax | Prism.js CDN | Lightweight, themeable |
| State | React local state | Ephemeral, simple |
| Backend routes | None (002), 2 (003) | Reuse existing, minimal |
| Arabic RTL | Logical CSS + locale | Existing infra |

## Open Questions (Resolved)

1. **Version-specific preview URL**: Backend needs `GET /files/:id/versions/:versionNumber/download` — added to 003 contracts
2. **Large text files**: Use virtualized rendering — added to tasks
3. **SVG security**: Use `<img>` tag (sanitized by browser) not inline SVG — noted in tasks
4. **PDF password protection**: Show fallback with download link — noted in tasks