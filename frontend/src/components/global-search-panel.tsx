"use client";

import Link from "next/link";
import { useLocale } from "./locale-provider";
import { FileIcon } from "./file-icon";
import type { FileRecord, FolderRecord } from "../lib/api/types";

export type SearchFilter = "all" | "files" | "folders";

interface GlobalSearchPanelProps {
  input: string;
  open: boolean;
  loading: boolean;
  filter: SearchFilter;
  folders: FolderRecord[];
  files: FileRecord[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  onInputChange: (value: string) => void;
  onFilterChange: (filter: SearchFilter) => void;
  onSubmit: () => void;
  onOpenFolder: (folderId: string) => void;
  onPreviewFile: (file: Pick<FileRecord, "id" | "name" | "mimeType" | "size">) => void;
  dismiss: () => void;
}

/** Instant-results dropdown rendered under the global search input. */
export function GlobalSearchPanel({
  input, open, loading, filter, folders, files,
  containerRef, onInputChange, onFilterChange, onSubmit, onOpenFolder, onPreviewFile, dismiss,
}: GlobalSearchPanelProps) {
  const { label } = useLocale();
  const showFolders = filter === "all" || filter === "folders";
  const showFiles = filter === "all" || filter === "files";
  const hasResults = folders.length > 0 || files.length > 0;

  if (!open) {
    return (
      <div className="zoho-global-search" ref={containerRef}>
        <span className="zoho-search-glyph" aria-hidden="true">⌕</span>
        <input
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSubmit();
            if (event.key === "Escape") dismiss();
          }}
          placeholder={label("search.placeholder")}
          aria-label={label("search.placeholder")}
          role="combobox"
          aria-expanded={false}
          autoComplete="off"
        />
        <kbd aria-hidden="true">⌘ K</kbd>
      </div>
    );
  }

  return (
    <div className="zoho-global-search expanded" ref={containerRef}>
      <span className="zoho-search-glyph" aria-hidden="true">⌕</span>
      <input
        value={input}
        onChange={(event) => onInputChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSubmit();
          if (event.key === "Escape") dismiss();
        }}
        placeholder={label("search.placeholder")}
        aria-label={label("search.placeholder")}
        role="combobox"
        aria-expanded
        aria-controls="zoho-global-search-results"
        autoComplete="off"
      />
      <kbd aria-hidden="true">⌘ K</kbd>
      <div id="zoho-global-search-results" className="zoho-search-panel" role="listbox">
        <div className="zoho-search-filters" role="tablist" aria-label={label("search.filters")}>
          {(["all", "files", "folders"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              className={`zoho-filter-chip${filter === key ? " active" : ""}`}
              onClick={() => onFilterChange(key)}
            >
              {label(`search.filter.${key}`)}
            </button>
          ))}
          {loading ? <span className="zoho-spinner" aria-hidden="true">…</span> : null}
        </div>
        {!hasResults && input.trim() ? <div className="zoho-search-empty">{label("search.empty")}</div> : null}
        {showFolders && folders.length > 0 ? (
          <div className="zoho-search-group">
            <div className="zoho-search-group-title">{label("search.group.folders")}</div>
            {folders.slice(0, 6).map((folder) => (
              <button key={folder.id} type="button" role="option" aria-selected="false" className="zoho-search-row" onClick={() => onOpenFolder(folder.id)}>
                <FileIcon kind="folder" mimeType={null} name={folder.name} label={label("files.type.folder")} />
                <span className="zoho-search-name">{folder.name}</span>
                <span className="zoho-search-sub">{label("files.type.folder")}</span>
              </button>
            ))}
          </div>
        ) : null}
        {showFiles && files.length > 0 ? (
          <div className="zoho-search-group">
            <div className="zoho-search-group-title">{label("search.group.files")}</div>
            {files.slice(0, 8).map((file) => (
              <button key={file.id} type="button" role="option" aria-selected="false" className="zoho-search-row" onClick={() => onPreviewFile(file)}>
                <FileIcon kind="file" mimeType={file.mimeType} name={file.name} label={label("files.type.file")} />
                <span className="zoho-search-name">{file.name}</span>
                <span className="zoho-search-sub">{label("files.preview")}</span>
              </button>
            ))}
          </div>
        ) : null}
        {hasResults && input.trim() ? (
          <Link href={`/files?query=${encodeURIComponent(input.trim())}`} className="zoho-search-all" onClick={dismiss}>
            {label("search.viewAll")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
