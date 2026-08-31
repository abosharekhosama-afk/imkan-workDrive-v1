import { fileIconSymbol } from "./file-icon-logic";

export { fileIconSymbol } from "./file-icon-logic";

export type FileIconKind =
  | "folder"
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "code"
  | "archive"
  | "sheet"
  | "slides"
  | "doc"
  | "file";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "heic", "tiff", "avif", "ico", "raw", "psd", "ai"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mkv", "avi", "mov", "flv", "wmv", "3gp", "m4v", "mpg", "mpeg"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "aac", "flac", "m4a", "wma", "opus", "midi"]);
const PDF_EXTENSIONS = new Set(["pdf"]);
const CODE_EXTENSIONS = new Set([
  "ts", "tsx", "mts", "cts", "js", "mjs", "cjs", "jsx", "json", "jsonc",
  "md", "markdown", "log", "env", "ini", "toml", "cfg", "conf", "properties",
  "yaml", "yml", "xml", "html", "htm", "css", "scss", "less", "csv", "tsv",
  "py", "pyw", "java", "kt", "kts", "cpp", "cc", "cxx", "c", "h", "hpp", "cs",
  "php", "rb", "go", "rs", "swift", "sh", "bash", "zsh", "ps1", "bat", "cmd",
  "sql", "gradle", "gitignore", "diff", "patch",
]);
const ARCHIVE_EXTENSIONS = new Set(["zip", "rar", "7z", "tar", "gz", "gzip", "bz2", "xz", "iso", "dmg"]);
const SHEET_EXTENSIONS = new Set(["xls", "xlsx", "ods", "csv", "tsv"]);
const SLIDES_EXTENSIONS = new Set(["ppt", "pptx", "odp"]);
const DOC_EXTENSIONS = new Set(["doc", "docx", "odt", "rtf", "txt", "md", "markdown", "log", "pages"]);

/**
 * Rich semantic classification for the modern SVG file icons. Extension is
 * checked before MIME so mislabeled uploads (e.g. `.ts` reported as
 * `video/mp2t`) still get the correct code glyph.
 */
export function fileIconKind(kind: "folder" | "file", mimeType?: string | null, name = ""): FileIconKind {
  if (kind === "folder") return "folder";
  const base = name.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  const extension = dot > 0 && dot < base.length - 1 ? base.slice(dot + 1).toLowerCase() : base.startsWith(".") && base.length > 1 ? base.slice(1).toLowerCase() : "";
  const mime = (mimeType ?? "").toLowerCase();

  if (PDF_EXTENSIONS.has(extension) || mime === "application/pdf") return "pdf";
  if (IMAGE_EXTENSIONS.has(extension) || mime.startsWith("image/")) return "image";
  if (VIDEO_EXTENSIONS.has(extension) || mime.startsWith("video/")) return "video";
  if (AUDIO_EXTENSIONS.has(extension) || mime.startsWith("audio/")) return "audio";
  if (ARCHIVE_EXTENSIONS.has(extension) || ["application/zip", "application/x-7z-compressed", "application/gzip", "application/x-tar", "application/vnd.rar"].includes(mime)) return "archive";
  if (CODE_EXTENSIONS.has(extension) || ["application/json", "application/javascript", "application/typescript", "application/xml", "application/x-yaml", "application/x-sh", "application/sql", "text/html", "text/css"].includes(mime)) return "code";
  if (SHEET_EXTENSIONS.has(extension) || mime.includes("spreadsheet") || mime === "text/csv") return "sheet";
  if (SLIDES_EXTENSIONS.has(extension) || mime.includes("presentation")) return "slides";
  if (DOC_EXTENSIONS.has(extension) || mime.startsWith("text/") || mime.includes("wordprocessing")) return "doc";
  return "file";
}

type FileTypeIconProps = {
  kind: FileIconKind;
  size?: number;
  className?: string;
};

const ICON_COLORS: Record<FileIconKind, { accent: string; body: string }> = {
  folder: { accent: "#f6b73c", body: "#fbd98a" },
  image: { accent: "#8b5cf6", body: "#c4b5fd" },
  video: { accent: "#ef4444", body: "#fca5a5" },
  audio: { accent: "#ec4899", body: "#f9a8d4" },
  pdf: { accent: "#dc2626", body: "#fecaca" },
  code: { accent: "#2563eb", body: "#bfdbfe" },
  archive: { accent: "#d97706", body: "#fde68a" },
  sheet: { accent: "#16a34a", body: "#bbf7d0" },
  slides: { accent: "#ea580c", body: "#fed7aa" },
  doc: { accent: "#2563eb", body: "#dbeafe" },
  file: { accent: "#64748b", body: "#e2e8f0" },
};

function folderGlyph(accent: string) {
  return (
    <g>
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l1.7 2H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H4.5A1.5 1.5 0 0 1 3 17.5Z" fill={accent} />
      <path d="M4.8 10.6h14.4v6.9a1.5 1.5 0 0 1-1.5 1.5H6.3a1.5 1.5 0 0 1-1.5-1.5Z" fill="#ffffff" opacity=".22" />
    </g>
  );
}

function docSheetGlyph(accent: string, body: string, badge?: string) {
  return (
    <g>
      <path d="M6 2.8h8.2L19 7.6v12.4a1.4 1.4 0 0 1-1.4 1.4H6a1.4 1.4 0 0 1-1.4-1.4V4.2A1.4 1.4 0 0 1 6 2.8Z" fill={body} />
      <path d="M14.2 2.8 19 7.6h-4.8Z" fill={accent} opacity=".5" />
      {badge ? (
        <text x="12" y="16.4" textAnchor="middle" fontSize="6.2" fontWeight="700" fill={accent} fontFamily="system-ui, sans-serif">{badge}</text>
      ) : (
        <path d="M7.6 11h8.8M7.6 14h8.8M7.6 17h5.8" stroke={accent} strokeWidth="1.3" strokeLinecap="round" />
      )}
    </g>
  );
}

/**
 * Modern, colored, semantic file-type glyph (Zoho WorkDrive style): the
 * accent color + glyph identify the content family at a glance.
 */
export function FileTypeIcon({ kind, size = 20, className }: FileTypeIconProps) {
  const { accent, body } = ICON_COLORS[kind];
  const glyph = (() => {
    switch (kind) {
      case "folder":
        return folderGlyph(accent);
      case "image":
        return (
          <g fill="none" stroke={accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3.5" y="4.5" width="17" height="15" rx="2" fill={body} fillOpacity=".35" />
            <circle cx="9" cy="10" r="1.6" fill={accent} stroke="none" />
            <path d="m4.5 17.5 4.5-4 3.5 3 3-2.5 4 3.5" />
          </g>
        );
      case "video":
        return (
          <g fill="none" stroke={accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5.5" width="13" height="13" rx="2" fill={body} fillOpacity=".35" />
            <path d="m16 10.5 5-3v9l-5-3" />
          </g>
        );
      case "audio":
        return (
          <g fill="none" stroke={accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V6.8l10-2v10.4" />
            <circle cx="6.5" cy="18" r="2.5" fill={body} fillOpacity=".5" />
            <circle cx="16.5" cy="15.2" r="2.5" fill={body} fillOpacity=".5" />
          </g>
        );
      case "pdf":
        return docSheetGlyph(accent, body, "PDF");
      case "code":
        return (
          <g fill="none" stroke={accent} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="m8.5 8.5-4 3.5 4 3.5" />
            <path d="m15.5 8.5 4 3.5-4 3.5" />
            <path d="m13.2 5.5-2.4 13" />
          </g>
        );
      case "archive":
        return (
          <g>
            <rect x="5" y="3" width="14" height="18" rx="1.8" fill={body} />
            <path d="M10 3h4v3.4l-2 2-2-2Z" fill={accent} opacity=".7" />
            <rect x="10.6" y="10.4" width="2.8" height="4.6" rx="1.2" fill={accent} />
          </g>
        );
      case "sheet":
        return (
          <g>
            <rect x="4.5" y="3" width="15" height="18" rx="1.8" fill={body} />
            <path d="M4.5 9h15M4.5 15h15M11.5 9v12" stroke={accent} strokeWidth="1.4" />
          </g>
        );
      case "slides":
        return (
          <g fill="none" stroke={accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3.5" y="4.5" width="17" height="11.5" rx="1.8" fill={body} />
            <path d="M12 16v3.5M8.5 21h7" />
          </g>
        );
      case "doc":
      default:
        return docSheetGlyph(accent, body);
    }
  })();

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      {glyph}
    </svg>
  );
}

type FileIconProps = {
  kind: "folder" | "file";
  mimeType?: string | null;
  name?: string;
  label: string;
};

export function FileIcon({ kind, mimeType, name, label }: FileIconProps) {
  return (
    <span aria-label={label} role="img" className="me-2 inline-flex flex-none items-center">
      <FileTypeIcon kind={fileIconKind(kind, mimeType, name)} size={20} />
    </span>
  );
}
