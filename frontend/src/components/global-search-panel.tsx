"use client";

import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import { useLocale } from "./locale-provider";
import { FileIcon } from "./file-icon";
import type { FileRecord, FolderRecord } from "../lib/api/types";

export type SearchFilter = "all" | "files" | "folders";
export type OwnerFilter = "anyone" | "me";

interface GlobalSearchPanelProps {
  input: string;
  open: boolean;
  loading: boolean;
  filter: SearchFilter;
  ownerFilter: OwnerFilter;
  folders: FolderRecord[];
  files: FileRecord[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  onInputChange: (value: string) => void;
  onFilterChange: (filter: SearchFilter) => void;
  onOwnerFilterChange: (owner: OwnerFilter) => void;
  onSubmit: () => void;
  onOpenFolder: (folderId: string) => void;
  onPreviewFile: (file: Pick<FileRecord, "id" | "name" | "mimeType" | "size">) => void;
  dismiss: () => void;
}

/** Instant-results dropdown: filters first, then results (Zoho-style). */
export function GlobalSearchPanel({
  input, open, loading, filter, ownerFilter, folders, files,
  containerRef, onInputChange, onFilterChange, onOwnerFilterChange, onSubmit, onOpenFolder, onPreviewFile, dismiss,
}: GlobalSearchPanelProps) {
  const { label, locale } = useLocale();
  const ar = locale === "ar";
  const showFolders = filter === "all" || filter === "folders";
  const showFiles = filter === "all" || filter === "files";
  const hasResults = folders.length > 0 || files.length > 0;

  useLayoutEffect(() => {
    if (!open || !containerRef.current) return;
    const panelEl = containerRef.current.querySelector(".zoho-search-panel") as HTMLElement | null;
    if (!panelEl) return;
    panelEl.style.position = "";
    panelEl.style.left = "";
    panelEl.style.right = "";
    panelEl.style.top = "";
    panelEl.style.width = "";
    panelEl.style.maxWidth = "";
    panelEl.style.insetInlineStart = "";
    panelEl.style.marginInlineStart = "";
    panelEl.style.zIndex = "120";
  }, [open, input, filter, ownerFilter, folders.length, files.length]);

  const inputRow = (
    <>
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
        aria-expanded={open}
        aria-controls={open ? "zoho-global-search-results" : undefined}
        autoComplete="off"
      />
      <kbd>⌘K</kbd>
    </>
  );

  if (!open) {
    return (
      <div className="zoho-global-search" ref={containerRef}>
        {inputRow}
      </div>
    );
  }

  return (
    <div className="zoho-global-search expanded" ref={containerRef}>
      {inputRow}
      <div id="zoho-global-search-results" className="zoho-search-panel" role="listbox">
        {/* Filters ALWAYS above results */}
        <div className="zoho-search-toolbar">
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
          <div className="zoho-search-owner-filters" role="group" aria-label={ar ? "أنشئ بواسطة" : "Created by"}>
            <span className="zoho-search-owner-label">{ar ? "أنشئ بواسطة" : "Created by"}</span>
            <button
              type="button"
              className={`zoho-filter-chip${ownerFilter === "anyone" ? " active" : ""}`}
              onClick={() => onOwnerFilterChange("anyone")}
            >
              {ar ? "أي شخص" : "Anyone"}
            </button>
            <button
              type="button"
              className={`zoho-filter-chip${ownerFilter === "me" ? " active" : ""}`}
              onClick={() => onOwnerFilterChange("me")}
            >
              {ar ? "أنا" : "Me"}
            </button>
          </div>
        </div>

        <div className="zoho-search-results-body">
          {!hasResults && input.trim() ? (
            <div className="zoho-search-empty">{label("search.empty")}</div>
          ) : null}
          {showFolders && folders.length > 0 ? (
            <div className="zoho-search-group">
              <div className="zoho-search-group-title">{label("search.group.folders")}</div>
              {folders.slice(0, 6).map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  role="option"
                  aria-selected="false"
                  className="zoho-search-row"
                  onClick={() => onOpenFolder(folder.id)}
                >
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
                <button
                  key={file.id}
                  type="button"
                  role="option"
                  aria-selected="false"
                  className="zoho-search-row"
                  onClick={() => onPreviewFile(file)}
                >
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
    </div>
  );
}
