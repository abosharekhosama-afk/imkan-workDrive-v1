import test from "node:test";
import assert from "node:assert/strict";
import { createUploadQueueItems, formatUploadSize, updateUploadQueueItem } from "./upload-queue-logic.ts";

test("creates a stable queue item for every selected file", () => {
  const files = [{ name: "one.pdf", size: 1024 }, { name: "two.txt", size: 2048 }] as File[];
  const items = createUploadQueueItems(files, (() => { let index = 0; return () => `upload-${++index}`; })());
  assert.deepEqual(items.map((item) => [item.id, item.status, item.progress]), [
    ["upload-1", "queued", null], ["upload-2", "queued", null],
  ]);
});

test("updates only the requested item and preserves queue contents", () => {
  const files = [{ name: "one.pdf" }, { name: "two.pdf" }] as File[];
  const items = createUploadQueueItems(files, (() => { let index = 0; return () => `id-${++index}`; })());
  const updated = updateUploadQueueItem(items, "id-2", { status: "failed", error: "safe error" });
  assert.equal(updated[0].status, "queued");
  assert.deepEqual(updated[1], { ...items[1], status: "failed", error: "safe error" });
});

test("formats compact upload sizes without exposing file contents", () => {
  assert.equal(formatUploadSize(512), "512 B");
  assert.equal(formatUploadSize(2048), "2 KB");
  assert.equal(formatUploadSize(2 * 1024 * 1024), "2.0 MB");
});
