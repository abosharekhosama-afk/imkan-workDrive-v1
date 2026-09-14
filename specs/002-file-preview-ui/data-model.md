# Data Model: File Preview UI

**Feature**: File Preview UI
**Branch**: `002-file-preview-ui`

## Entities

No new database entities. Preview is a client-side view of existing data.

### Existing Entities Used

| Entity | Source | Fields Used |
| :--- | :--- | :--- |
| File | Phase 04 `File` model | `id`, `name`, `mimeType`, `size`, `folderId`, `teamFolderId`, `ownerId`, `versions[]` |
| FileVersion | Phase 04 `FileVersion` model | `id`, `versionNumber`, `s3Key`, `size`, `mimeType`, `sha256Hash`, `uploadedById` |
| User | Phase 04 `User` model | `id`, `email`, `name` (for uploader display) |

## Preview Session State (Client Only)

```typescript
type PreviewSession = {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  versionNumber?: number;      // undefined = current version
  currentPage: number;         // PDF only
  zoomLevel: number;           // 0.25 - 5.0
  rotation: number;            // 0, 90, 180, 270 (images only)
  panOffset: { x: number; y: number }; // images only
  searchQuery: string;         // PDF text search
  isLoading: boolean;
  error: string | null;
};
```

## MIME Type Categories

| Category | MIME Types | Preview Component |
| :--- | :--- | :--- |
| PDF | `application/pdf` | `PdfPreview` |
| Image | `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/svg+xml` | `ImagePreview` |
| Video | `video/mp4`, `video/webm`, `video/quicktime` | `VideoPreview` |
| Text/Code | `text/*`, `application/json`, `application/javascript`, `application/typescript`, `application/x-sh`, `application/sql`, `text/markdown`, `text/csv`, `text/html`, `text/css` | `TextPreview` |
| Unsupported | All others | Fallback card with download link |

## Language Detection (Text Preview)

| Extension | Language | Prism Alias |
| :--- | :--- | :--- |
| `.js`, `.mjs` | JavaScript | `javascript` |
| `.ts`, `.tsx` | TypeScript | `typescript` |
| `.py` | Python | `python` |
| `.json` | JSON | `json` |
| `.md`, `.markdown` | Markdown | `markdown` |
| `.html`, `.htm` | HTML | `html` |
| `.css` | CSS | `css` |
| `.sql` | SQL | `sql` |
| `.sh`, `.bash` | Shell | `bash` |
| `.yml`, `.yaml` | YAML | `yaml` |
| `.xml` | XML | `xml` |
| `.csv` | CSV | `csv` |
| (none/unknown) | Plain text | `plaintext` |

## Validation Rules

- Preview session only created after `canRead` verified via existing API call
- Signed URL fetched on-demand, cached for session duration (TTL ~5 min)
- PDF page number clamped to `1..pageCount`
- Zoom level clamped to category limits (PDF: 0.5-3.0, Image: 0.25-5.0, Text: 0.5-3.0)
- Rotation only for images, clamped to 0/90/180/270
- Pan offset reset on zoom change or page change

## State Transitions

```text
Closed → Loading (fetch signed URL) → Ready (render preview)
Ready ↔ Loading (page change / version switch)
Ready → Error (signed URL expired / network error)
Error → Loading (retry)
Ready → Closed (Escape / close button / backdrop click)
```

## Relationships

- Preview Session → File (1:1, ephemeral)
- Preview Session → FileVersion (optional, for version history preview)
- Preview Modal → FileBrowser (parent component, focus return target)