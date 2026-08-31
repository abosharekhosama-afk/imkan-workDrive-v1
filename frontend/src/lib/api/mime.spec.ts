import test from "node:test";
import assert from "node:assert/strict";
import { guessMimeFromName, resolveMimeType } from "./mime.ts";

test("explicit browser mime types win over extension guessing", () => {
  assert.equal(resolveMimeType("image/jpeg", "photo.png"), "image/jpeg");
});

test("empty or octet-stream types fall back to extension sniffing", () => {
  assert.equal(resolveMimeType("", "invoice.pdf"), "application/pdf");
  assert.equal(resolveMimeType("application/octet-stream", "shot.PNG"), "image/png");
  assert.equal(resolveMimeType(undefined, "clip.webm"), "video/webm");
});

test("unknown extensions degrade to safe octet-stream", () => {
  assert.equal(guessMimeFromName("archive.zst"), null);
  assert.equal(resolveMimeType(null, "blob"), "application/octet-stream");
  assert.equal(resolveMimeType("garbage", "blob.bin"), "application/octet-stream");
});

test("dotfiles like .env resolve their extension and MIME", () => {
  assert.equal(resolveMimeType("", ".env"), "text/plain");
  assert.equal(resolveMimeType("application/octet-stream", ".env"), "text/plain");
  assert.equal(resolveMimeType("", ".gitignore"), "text/plain");
});
