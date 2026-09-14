"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "../locale-provider";
import { formatBytes } from "../../lib/api/quota";

interface ArchiveViewerProps {
  url: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  onDownload: () => void;
}

type ZipEntry = {
  name: string;
  isDirectory: boolean;
  compressedSize: number;
  uncompressedSize: number;
  method: number;
  localHeaderOffset: number;
};

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}
function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

async function fetchRange(url: string, start: number, end: number): Promise<ArrayBuffer> {
  const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
  if (!response.ok && response.status !== 206) throw new Error(`Range fetch failed: ${response.status}`);
  return response.arrayBuffer();
}

/**
 * Parses the ZIP central directory using two HTTP Range requests (EOCD tail +
 * directory body), so even multi-hundred-megabyte archives list instantly
 * without downloading the payload.
 */
async function listZipEntries(url: string, fileSize: number): Promise<ZipEntry[]> {
  const tailSize = Math.min(65_536, fileSize);
  const tail = await fetchRange(url, fileSize - tailSize, fileSize - 1);
  const tailView = new DataView(tail);
  let eocdOffset = -1;
  for (let offset = tail.byteLength - 22; offset >= 0; offset -= 1) {
    if (readUint32(tailView, offset) === EOCD_SIGNATURE) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("Not a ZIP archive");
  const entryCount = readUint16(tailView, eocdOffset + 10);
  const directorySize = readUint32(tailView, eocdOffset + 12);
  const directoryOffset = readUint32(tailView, eocdOffset + 16);

  const directory = await fetchRange(url, directoryOffset, directoryOffset + directorySize - 1);
  const view = new DataView(directory);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let cursor = 0;
  for (let index = 0; index < entryCount && cursor + 46 <= directory.byteLength; index += 1) {
    if (readUint32(view, cursor) !== CENTRAL_SIGNATURE) break;
    const method = readUint16(view, cursor + 10);
    const compressedSize = readUint32(view, cursor + 20);
    const uncompressedSize = readUint32(view, cursor + 24);
    const nameLength = readUint16(view, cursor + 28);
    const extraLength = readUint16(view, cursor + 30);
    const commentLength = readUint16(view, cursor + 32);
    const localHeaderOffset = readUint32(view, cursor + 42);
    const name = decoder.decode(new Uint8Array(directory, cursor + 46, nameLength));
    entries.push({
      name,
      isDirectory: name.endsWith("/"),
      compressedSize,
      uncompressedSize,
      method,
      localHeaderOffset,
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Extracts one entry: stored (0) bytes are copied, deflate (8) is inflated in the browser. */
async function extractZipEntry(url: string, entry: ZipEntry): Promise<Blob> {
  const header = await fetchRange(url, entry.localHeaderOffset, entry.localHeaderOffset + 29);
  const headerView = new DataView(header);
  if (readUint32(headerView, 0) !== LOCAL_SIGNATURE) throw new Error("Corrupt archive entry");
  const nameLength = readUint16(headerView, 26);
  const extraLength = readUint16(headerView, 28);
  const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength;
  const compressed = await fetchRange(url, dataStart, dataStart + entry.compressedSize - 1);

  if (entry.method === 0) return new Blob([compressed]);
  if (entry.method !== 8) throw new Error("Unsupported compression method");
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).blob();
}

/**
 * Archive viewer: lists the folder/file structure inside ZIP archives via the
 * central directory, supports per-entry extraction and download (stored and
 * deflate methods). Non-ZIP formats (RAR/7z/ISO…) show an elegant fallback
 * card with a prominent download action.
 */
export function ArchiveViewer({ url, fileName, mimeType, fileSize, onDownload }: ArchiveViewerProps) {
  const { label } = useLocale();
  const [entries, setEntries] = useState<ZipEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyEntry, setBusyEntry] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const isZip = mimeType === "application/zip" || fileName.toLowerCase().endsWith(".zip");

  useEffect(() => {
    if (!isZip || fileSize === 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    listZipEntries(url, fileSize)
      .then((result) => {
        if (mountedRef.current) setEntries(result);
      })
      .catch(() => {
        if (mountedRef.current) setError(label("preview.unsupported"));
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
  }, [url, fileSize, isZip, label]);

  const handleExtract = useCallback(async (entry: ZipEntry) => {
    setBusyEntry(entry.name);
    try {
      const blob = await extractZipEntry(url, entry);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = entry.name.split("/").pop() || "entry";
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
    } catch {
      setError(label("preview.error"));
    } finally {
      setBusyEntry(null);
    }
  }, [url, label]);

  if (!isZip || (error !== null && entries === null)) {
    return (
      <div className="zoho-unsupported-card">
        <div className="zoho-unsupported-icon" aria-hidden>🗜️</div>
        <h3>{fileName}</h3>
        <p>{label("preview.archiveUnsupported")}</p>
        <button type="button" className="zoho-btn zoho-btn-primary" onClick={onDownload}>
          {label("preview.downloadToView")}
        </button>
      </div>
    );
  }

  const files = entries?.filter((entry) => !entry.isDirectory) ?? [];
  const folderCount = new Set(
    files.map((entry) => entry.name.split("/").slice(0, -1).join("/")).filter(Boolean),
  ).size;

  return (
    <div className="zoho-viewer-root zoho-archive-root">
      <div className="zoho-viewer-controls">
        <span className="zoho-ctl-zoom">
          🗜️ {fileName} — {label("preview.archiveItems").replace("{count}", String(files.length))} · {folderCount} 📁 · {formatBytes(fileSize)}
        </span>
      </div>
      <div className="zoho-archive-list" role="list">
        {loading ? <div className="zoho-viewer-spinner" aria-label={label("preview.loading")} /> : null}
        {files.map((entry) => (
          <div key={entry.name} className="zoho-archive-row" role="listitem">
            <span className="zoho-archive-name" title={entry.name}>📄 {entry.name}</span>
            <span className="zoho-archive-size">{formatBytes(entry.uncompressedSize)}</span>
            <button
              type="button"
              className="zoho-ctl"
              disabled={busyEntry === entry.name}
              onClick={() => void handleExtract(entry)}
              title={label("preview.archiveExtract")}
            >
              ⬇
            </button>
          </div>
        ))}
        {!loading && files.length === 0 ? <p className="zoho-archive-empty">{label("preview.noActivity")}</p> : null}
      </div>
    </div>
  );
}