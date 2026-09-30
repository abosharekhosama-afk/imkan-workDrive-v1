export type ZipCentralEntry = {
  name: string;
  isDirectory: boolean;
  compressedSize: number;
  uncompressedSize: number;
  method: number;
  flags: number;
  localHeaderOffset: number;
  encrypted: boolean;
};

export type ZipTreeNode = {
  name: string;
  path: string;
  directory: boolean;
  entry: ZipCentralEntry | null;
  children: ZipTreeNode[];
};

export type ZipPreviewKind = "image" | "markdown" | "text" | "file";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"]);
const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "json", "csv", "tsv", "log", "xml", "html", "htm", "css", "js", "ts", "tsx", "jsx",
  "yml", "yaml", "ini", "env", "svg",
]);

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function readUint16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0;
}

function findEocd(bytes: Uint8Array): number {
  const start = Math.max(0, bytes.length - 22 - 65_535);
  for (let offset = bytes.length - 22; offset >= start; offset -= 1) {
    if (readUint32(bytes, offset) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

export function locateZipDirectory(bytes: Uint8Array): { entryCount: number; directorySize: number; directoryOffset: number } {
  const eocd = findEocd(bytes);
  if (eocd < 0) throw new Error("Not a ZIP archive");
  const entryCount = readUint16(bytes, eocd + 10);
  const directorySize = readUint32(bytes, eocd + 12);
  const directoryOffset = readUint32(bytes, eocd + 16);
  if (entryCount === 0xffff || directoryOffset === 0xffffffff) throw new Error("ZIP64 archive");
  return { entryCount, directorySize, directoryOffset };
}

export function readZipCentralRecords(directory: Uint8Array, entryCount: number): ZipCentralEntry[] {
  const decoder = new TextDecoder();
  const entries: ZipCentralEntry[] = [];
  let cursor = 0;
  for (let index = 0; index < entryCount && cursor + 46 <= directory.length; index += 1) {
    if (readUint32(directory, cursor) !== CENTRAL_SIGNATURE) break;
    const flags = readUint16(directory, cursor + 8);
    const method = readUint16(directory, cursor + 10);
    const compressedSize = readUint32(directory, cursor + 20);
    const uncompressedSize = readUint32(directory, cursor + 24);
    const nameLength = readUint16(directory, cursor + 28);
    const extraLength = readUint16(directory, cursor + 30);
    const commentLength = readUint16(directory, cursor + 32);
    const localHeaderOffset = readUint32(directory, cursor + 42);
    const name = decoder.decode(directory.subarray(cursor + 46, cursor + 46 + nameLength));
    entries.push({
      name,
      isDirectory: name.endsWith("/"),
      compressedSize,
      uncompressedSize,
      method,
      flags,
      localHeaderOffset,
      encrypted: (flags & 1) === 1,
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Read the ZIP central directory from a complete archive buffer. */
export function readZipCentralDirectory(bytes: Uint8Array): ZipCentralEntry[] {
  const located = locateZipDirectory(bytes);
  const directory = bytes.subarray(located.directoryOffset, located.directoryOffset + located.directorySize);
  return readZipCentralRecords(directory, located.entryCount);
}

/** Compressed bytes of one entry, taken from a full archive buffer. */
export function readZipLocalBytes(bytes: Uint8Array, entry: ZipCentralEntry): Uint8Array {
  if (entry.encrypted) throw new Error("Encrypted entry");
  if (entry.localHeaderOffset + 30 > bytes.length) throw new Error("Corrupt archive entry");
  if (readUint32(bytes, entry.localHeaderOffset) !== LOCAL_SIGNATURE) throw new Error("Corrupt archive entry");
  const nameLength = readUint16(bytes, entry.localHeaderOffset + 26);
  const extraLength = readUint16(bytes, entry.localHeaderOffset + 28);
  const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > bytes.length) throw new Error("Corrupt archive entry");
  return bytes.subarray(dataStart, dataEnd);
}

function sortNodes(nodes: ZipTreeNode[]) {
  nodes.sort((left, right) => Number(right.directory) - Number(left.directory) || left.name.localeCompare(right.name));
  for (const node of nodes) sortNodes(node.children);
}

/** Group central-directory paths into a folder tree. */
export function buildZipTree(entries: ZipCentralEntry[]): ZipTreeNode[] {
  const roots: ZipTreeNode[] = [];
  const directories = new Map<string, ZipTreeNode>();
  const ensureDirectory = (path: string): ZipTreeNode => {
    const existing = directories.get(path);
    if (existing) return existing;
    const parts = path.split("/");
    const name = parts[parts.length - 1] || path;
    const parentPath = parts.slice(0, -1).join("/");
    const node: ZipTreeNode = { name, path, directory: true, entry: null, children: [] };
    directories.set(path, node);
    if (parentPath) ensureDirectory(parentPath).children.push(node);
    else roots.push(node);
    return node;
  };
  for (const entry of entries) {
    const path = entry.name.replace(/\/+$/, "");
    if (!path) continue;
    if (entry.isDirectory) {
      ensureDirectory(path).entry = entry;
      continue;
    }
    const parts = path.split("/");
    const parentPath = parts.slice(0, -1).join("/");
    const node: ZipTreeNode = { name: parts[parts.length - 1] || path, path, directory: false, entry, children: [] };
    if (parentPath) ensureDirectory(parentPath).children.push(node);
    else roots.push(node);
  }
  sortNodes(roots);
  return roots;
}

export function zipPreviewKind(name: string): ZipPreviewKind {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "md" || extension === "markdown") return "markdown";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (TEXT_EXTENSIONS.has(extension)) return "text";
  return "file";
}

export function countZipFiles(nodes: ZipTreeNode[]): number {
  return nodes.reduce((sum, node) => sum + (node.directory ? countZipFiles(node.children) : 1), 0);
}
