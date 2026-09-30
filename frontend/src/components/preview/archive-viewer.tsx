"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "../locale-provider";
import { FileTypeIcon, fileIconKind } from "../file-icon";
import { formatBytes } from "../../lib/api/quota";
import { MarkdownDocument } from "./markdown-viewer";
import {
  buildZipTree,
  countZipFiles,
  locateZipDirectory,
  readZipCentralDirectory,
  readZipCentralRecords,
  readZipLocalBytes,
  zipPreviewKind,
  type ZipCentralEntry,
  type ZipTreeNode,
} from "../../lib/zip-preview-logic";

interface ArchiveViewerProps {
  url: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  onDownload: () => void;
}

async function inflate(bytes: Uint8Array, method: number): Promise<Uint8Array> {
  if (method === 0) return bytes;
  if (method !== 8) throw new Error("Unsupported compression method");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function fetchBytes(url: string, start?: number, end?: number): Promise<{ bytes: Uint8Array; partial: boolean }> {
  const headers = start === undefined ? undefined : { Range: `bytes=${start}-${end}` };
  const response = await fetch(url, { headers });
  if (!response.ok && response.status !== 206) throw new Error(`HTTP ${response.status}`);
  return { bytes: new Uint8Array(await response.arrayBuffer()), partial: response.status === 206 };
}

async function loadZip(url: string, fileSize: number): Promise<{ entries: ZipCentralEntry[]; bytes: Uint8Array | null }> {
  if (fileSize > 0) {
    const tailSize = Math.min(65_536, fileSize);
    const tailStart = fileSize - tailSize;
    try {
      const tail = await fetchBytes(url, tailStart, fileSize - 1);
      if (tail.partial) {
        const located = locateZipDirectory(tail.bytes);
        const insideTail = located.directoryOffset >= tailStart;
        const directory = insideTail
          ? tail.bytes.subarray(located.directoryOffset - tailStart, located.directoryOffset - tailStart + located.directorySize)
          : (await fetchBytes(url, located.directoryOffset, located.directoryOffset + located.directorySize - 1)).bytes;
        if (!insideTail && directory.length > located.directorySize) {
          const full = directory;
          return { entries: readZipCentralDirectory(full), bytes: full };
        }
        return { entries: readZipCentralRecords(directory, located.entryCount), bytes: null };
      }
      if (tail.bytes.byteLength > 0) return { entries: readZipCentralDirectory(tail.bytes), bytes: tail.bytes };
    } catch {
      // Presigned links often ignore Range. The full download below still lists the archive.
    }
  }
  const full = await fetchBytes(url);
  return { entries: readZipCentralDirectory(full.bytes), bytes: full.bytes };
}

function ZipRows({
  nodes,
  depth,
  openPaths,
  selected,
  onToggle,
  onOpen,
}: {
  nodes: ZipTreeNode[];
  depth: number;
  openPaths: Set<string>;
  selected: string;
  onToggle: (path: string) => void;
  onOpen: (node: ZipTreeNode) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        const open = openPaths.has(node.path);
        return (
          <div key={node.path}>
            <button
              type="button"
              className={`zoho-zip-row${selected === node.path ? " is-active" : ""}`}
              style={{ paddingInlineStart: 12 + depth * 16 }}
              onClick={() => node.directory ? onToggle(node.path) : onOpen(node)}
            >
              <span className="zoho-zip-chevron" aria-hidden>{node.directory ? (open ? "▾" : "▸") : ""}</span>
              <FileTypeIcon kind={node.directory ? "folder" : fileIconKind("file", "", node.name)} size={16} />
              <span className="zoho-zip-name" title={node.path}>{node.name}</span>
              {node.entry && !node.directory ? <span className="zoho-zip-size">{formatBytes(node.entry.uncompressedSize)}</span> : null}
            </button>
            {node.directory && open ? (
              <ZipRows nodes={node.children} depth={depth + 1} openPaths={openPaths} selected={selected} onToggle={onToggle} onOpen={onOpen} />
            ) : null}
          </div>
        );
      })}
    </>
  );
}

export function ArchiveViewer({ url, fileName, mimeType, fileSize, onDownload }: ArchiveViewerProps) {
  const { locale, label } = useLocale();
  const ar = locale === "ar";
  const isZip = mimeType === "application/zip" || fileName.toLowerCase().endsWith(".zip");
  const [entries, setEntries] = useState<ZipCentralEntry[] | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openPaths, setOpenPaths] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState("");
  const [preview, setPreview] = useState<{ kind: "image" | "markdown" | "text" | "file"; name: string; text?: string; imageUrl?: string; message?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isZip) {
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    setError(null);
    setEntries(null);
    setPreview(null);
    loadZip(url, fileSize)
      .then((result) => {
        if (!live) return;
        setEntries(result.entries);
        setBytes(result.bytes);
        setOpenPaths(new Set(buildZipTree(result.entries).filter((node) => node.directory).map((node) => node.path)));
      })
      .catch(() => { if (live) setError(label("preview.archiveUnsupported")); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [url, fileSize, isZip, label]);

  useEffect(() => () => {
    if (preview?.imageUrl) URL.revokeObjectURL(preview.imageUrl);
  }, [preview]);

  const tree = useMemo(() => buildZipTree(entries ?? []), [entries]);
  const fileCount = useMemo(() => countZipFiles(tree), [tree]);

  const readEntry = useCallback(async (entry: ZipCentralEntry) => {
    if (entry.encrypted) throw new Error("encrypted");
    if (entry.compressedSize === 0) return new Uint8Array();
    if (bytes) return inflate(readZipLocalBytes(bytes, entry), entry.method);
    const header = await fetchBytes(url, entry.localHeaderOffset, entry.localHeaderOffset + 29);
    if (!header.partial) throw new Error("range");
    const view = new DataView(header.bytes.buffer, header.bytes.byteOffset, header.bytes.byteLength);
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength;
    const data = await fetchBytes(url, dataStart, dataStart + Math.max(0, entry.compressedSize - 1));
    if (!data.partial && entry.compressedSize !== data.bytes.byteLength) throw new Error("range");
    return inflate(data.bytes.subarray(0, entry.compressedSize), entry.method);
  }, [bytes, url]);

  const openFile = useCallback(async (node: ZipTreeNode) => {
    if (!node.entry) return;
    setSelected(node.path);
    setBusy(true);
    setError(null);
    const kind = zipPreviewKind(node.name);
    try {
      const raw = await readEntry(node.entry);
      if (kind === "image") {
        const type = node.name.toLowerCase().endsWith(".svg") ? "image/svg+xml" : "application/octet-stream";
        const imageUrl = URL.createObjectURL(new Blob([raw], { type }));
        setPreview((current) => {
          if (current?.imageUrl) URL.revokeObjectURL(current.imageUrl);
          return { kind, name: node.name, imageUrl };
        });
      } else if (kind === "markdown" || kind === "text") {
        setPreview({ kind, name: node.name, text: new TextDecoder().decode(raw) });
      } else {
        setPreview({ kind: "file", name: node.name, message: ar ? "هذا النوع يُستخرج للتنزيل." : "This file type can be extracted and downloaded." });
      }
    } catch {
      setPreview({ kind: "file", name: node.name, message: ar ? "تعذرت معاينة هذا العنصر داخل الأرشيف." : "This item could not be previewed inside the archive." });
    } finally {
      setBusy(false);
    }
  }, [ar, readEntry]);

  const downloadEntry = useCallback(async () => {
    const node = entries?.find((entry) => entry.name.replace(/\/+$/, "") === selected);
    if (!node || node.isDirectory) return;
    setBusy(true);
    try {
      const raw = await readEntry(node);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([raw]));
      link.download = node.name.split("/").pop() || "entry";
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
    } catch {
      setError(label("preview.error"));
    } finally {
      setBusy(false);
    }
  }, [entries, label, readEntry, selected]);

  if (!isZip || (error && !entries)) {
    return (
      <div className="zoho-unsupported-card">
        <div className="zoho-unsupported-icon" aria-hidden>ZIP</div>
        <h3>{fileName}</h3>
        <p>{error || label("preview.archiveUnsupported")}</p>
        <button type="button" className="zoho-btn zoho-btn-primary" onClick={onDownload}>{label("preview.downloadToView")}</button>
      </div>
    );
  }

  return (
    <div className="zoho-viewer-root zoho-zip-root">
      <div className="zoho-viewer-controls zoho-zip-toolbar">
        <strong title={fileName}>{fileName}</strong>
        <span>{label("preview.archiveItems").replace("{count}", String(fileCount))} · {formatBytes(fileSize)}</span>
        <button type="button" className="zoho-ctl" onClick={onDownload}>{ar ? "تنزيل الأرشيف" : "Download archive"}</button>
      </div>
      <div className="zoho-zip-layout">
        <div className="zoho-zip-tree" role="tree">
          {loading ? <div className="zoho-viewer-spinner" aria-label={label("preview.loading")} /> : null}
          <ZipRows
            nodes={tree}
            depth={0}
            openPaths={openPaths}
            selected={selected}
            onToggle={(path) => setOpenPaths((current) => {
              const next = new Set(current);
              if (next.has(path)) next.delete(path);
              else next.add(path);
              return next;
            })}
            onOpen={(node) => void openFile(node)}
          />
          {!loading && fileCount === 0 ? <p className="zoho-zip-empty">{ar ? "الأرشيف فارغ." : "This archive is empty."}</p> : null}
        </div>
        <div className="zoho-zip-preview">
          {busy ? <div className="zoho-viewer-spinner" aria-label={label("preview.loading")} /> : null}
          {!preview && !busy ? <p className="zoho-zip-empty">{ar ? "اختر ملفًا من الأرشيف لمعاينته." : "Choose a file inside the archive to preview it."}</p> : null}
          {preview?.kind === "image" && preview.imageUrl ? <img src={preview.imageUrl} alt={preview.name} className="zoho-zip-image" /> : null}
          {preview?.kind === "markdown" ? <MarkdownDocument source={preview.text ?? ""} /> : null}
          {preview?.kind === "text" ? <pre className="zoho-md-source">{preview.text}</pre> : null}
          {preview?.kind === "file" ? (
            <div className="zoho-zip-filecard">
              <FileTypeIcon kind={fileIconKind("file", "", preview.name)} size={42} />
              <strong>{preview.name}</strong>
              <p>{preview.message}</p>
              <button type="button" className="zoho-btn zoho-btn-primary" disabled={busy} onClick={() => void downloadEntry()}>{label("preview.archiveExtract")}</button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
