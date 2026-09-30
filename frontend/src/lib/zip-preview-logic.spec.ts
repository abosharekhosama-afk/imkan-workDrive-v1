import assert from "node:assert/strict";
import test from "node:test";
import { buildZipTree, readZipCentralDirectory, zipPreviewKind } from "./zip-preview-logic.ts";

function u16(value: number): number[] {
  return [value & 255, (value >> 8) & 255];
}
function u32(value: number): number[] {
  return [value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >> 24) & 255];
}

function centralEntry(name: string, flags = 0): number[] {
  const encoded = Array.from(new TextEncoder().encode(name));
  return [
    0x50, 0x4b, 0x01, 0x02,
    ...u16(20), ...u16(20), ...u16(flags), ...u16(0), ...u16(0), ...u16(0),
    ...u32(0), ...u32(4), ...u32(4),
    ...u16(encoded.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(0),
    ...encoded,
  ];
}

test("zip listing builds a folder tree and classifies markdown", () => {
  const directory = [...centralEntry("notes/"), ...centralEntry("notes/readme.md"), ...centralEntry("photo.png", 1)];
  const eocd = [
    0x50, 0x4b, 0x05, 0x06,
    ...u16(0), ...u16(0), ...u16(3), ...u16(3),
    ...u32(directory.length), ...u32(0), ...u16(0),
  ];
  const entries = readZipCentralDirectory(Uint8Array.from([...directory, ...eocd]));
  assert.equal(entries.length, 3);
  assert.equal(entries[2]?.encrypted, true);
  const tree = buildZipTree(entries);
  assert.equal(tree[0]?.name, "notes");
  assert.equal(tree[0]?.children[0]?.name, "readme.md");
  assert.equal(tree[1]?.name, "photo.png");
  assert.equal(zipPreviewKind("notes/readme.md"), "markdown");
  assert.equal(zipPreviewKind("photo.png"), "image");
  assert.equal(zipPreviewKind("report.pdf"), "file");
});