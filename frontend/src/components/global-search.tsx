"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { searchNames } from "../lib/api/search";
import type { FileRecord, FolderRecord } from "../lib/api/types";
import { debounce } from "./view-mode-logic";
import { GlobalSearchPanel, type SearchFilter } from "./global-search-panel";

export const WORKDRIVE_PREVIEW_EVENT = "workdrive:preview";

export interface PreviewEventDetail {
  id: string;
  name: string;
  mimeType?: string;
  size?: number;
}

interface GlobalSearchProps {
  /** Fired alongside navigation so pages can reset their own search state. */
  onNavigate?: () => void;
}

/**
 * Top-bar enterprise search with instant results (files/folders chips),
 * keyboard submission fallback to the full results page, and preview
 * hand-off for files through `workdrive:preview` window events.
 */
export function GlobalSearch({ onNavigate }: GlobalSearchProps) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<SearchFilter>("all");
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const runIdRef = useRef(0);

  const runSearch = useCallback(async (rawQuery: string) => {
    const query = rawQuery.trim();
    if (!query) {
      setOpen(false);
      setFolders([]);
      setFiles([]);
      setLoading(false);
      return;
    }
    const runId = ++runIdRef.current;
    setLoading(true);
    try {
      const result = await searchNames(query);
      if (runId !== runIdRef.current) return; // stale response
      setFolders(result.folders ?? []);
      setFiles(result.files ?? []);
      setOpen(true);
    } catch {
      if (runId === runIdRef.current) setOpen(false);
    } finally {
      if (runId === runIdRef.current) setLoading(false);
    }
  }, []);

  const debouncedSearch = useMemo(() => debounce((q: string) => void runSearch(q), 250), [runSearch]);

  useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function onChange(value: string) {
    setInput(value);
    debouncedSearch(value);
  }

  function onSubmit() {
    const query = input.trim();
    if (!query) return;
    setOpen(false);
    router.push(`/files?query=${encodeURIComponent(query)}`);
    onNavigate?.();
  }

  function openFolder(folderId: string) {
    setOpen(false);
    router.push(`/files/${folderId}`);
    onNavigate?.();
  }

  function previewFile(file: Pick<FileRecord, "id" | "name" | "mimeType" | "size">) {
    setOpen(false);
    const detail: PreviewEventDetail = {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType ?? undefined,
      size: file.size ?? undefined,
    };
    window.dispatchEvent(new CustomEvent<PreviewEventDetail>(WORKDRIVE_PREVIEW_EVENT, { detail }));
    onNavigate?.();
  }

  return (
    <GlobalSearchPanel
      input={input}
      open={open}
      loading={loading}
      filter={filter}
      folders={folders}
      files={files}
      containerRef={containerRef}
      onInputChange={onChange}
      onFilterChange={setFilter}
      onSubmit={onSubmit}
      onOpenFolder={openFolder}
      onPreviewFile={previewFile}
      dismiss={() => setOpen(false)}
    />
  );
}
