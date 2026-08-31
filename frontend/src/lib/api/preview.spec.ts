import test from "node:test";
import assert from "node:assert/strict";
import { getPreviewMimeCategory, getLanguageFromMime } from "./preview.ts";

test("getPreviewMimeCategory returns correct category for PDF", () => {
  assert.equal(getPreviewMimeCategory("application/pdf"), "pdf");
});

test("getPreviewMimeCategory returns correct category for images", () => {
  assert.equal(getPreviewMimeCategory("image/png"), "image");
  assert.equal(getPreviewMimeCategory("image/jpeg"), "image");
  assert.equal(getPreviewMimeCategory("image/gif"), "image");
  assert.equal(getPreviewMimeCategory("image/webp"), "image");
  assert.equal(getPreviewMimeCategory("image/svg+xml"), "image");
});

test("getPreviewMimeCategory returns correct category for videos", () => {
  assert.equal(getPreviewMimeCategory("video/mp4"), "video");
  assert.equal(getPreviewMimeCategory("video/webm"), "video");
  assert.equal(getPreviewMimeCategory("video/quicktime"), "video");
});

test("getPreviewMimeCategory returns correct category for text/code", () => {
  assert.equal(getPreviewMimeCategory("text/plain"), "text");
  assert.equal(getPreviewMimeCategory("text/markdown"), "text");
  assert.equal(getPreviewMimeCategory("text/csv"), "text");
  assert.equal(getPreviewMimeCategory("text/html"), "text");
  assert.equal(getPreviewMimeCategory("text/css"), "text");
  assert.equal(getPreviewMimeCategory("application/json"), "text");
  assert.equal(getPreviewMimeCategory("application/javascript"), "text");
  assert.equal(getPreviewMimeCategory("application/typescript"), "text");
  assert.equal(getPreviewMimeCategory("application/x-sh"), "text");
  assert.equal(getPreviewMimeCategory("application/sql"), "text");
});

test("getPreviewMimeCategory returns unsupported for unknown types", () => {
  assert.equal(getPreviewMimeCategory("application/octet-stream"), "unsupported");
  assert.equal(getPreviewMimeCategory(""), "unsupported");
  assert.equal(getPreviewMimeCategory("unknown/type"), "unsupported");
});

test("getPreviewMimeCategory routes office and archive formats", () => {
  assert.equal(getPreviewMimeCategory("", "report.docx"), "office");
  assert.equal(getPreviewMimeCategory("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), "office");
  assert.equal(getPreviewMimeCategory("application/zip"), "archive");
  assert.equal(getPreviewMimeCategory("application/x-7z-compressed", "backup.7z"), "archive");
});

test("getLanguageFromMime detects language from extension", () => {
  assert.equal(getLanguageFromMime("text/plain", "test.js"), "javascript");
  assert.equal(getLanguageFromMime("text/plain", "test.mjs"), "javascript");
  assert.equal(getLanguageFromMime("text/plain", "test.ts"), "typescript");
  assert.equal(getLanguageFromMime("text/plain", "test.tsx"), "typescript");
  assert.equal(getLanguageFromMime("text/plain", "test.py"), "python");
  assert.equal(getLanguageFromMime("application/json", "test.json"), "json");
  assert.equal(getLanguageFromMime("text/markdown", "test.md"), "markdown");
  assert.equal(getLanguageFromMime("text/markdown", "test.markdown"), "markdown");
  assert.equal(getLanguageFromMime("text/html", "test.html"), "html");
  assert.equal(getLanguageFromMime("text/html", "test.htm"), "html");
  assert.equal(getLanguageFromMime("text/css", "test.css"), "css");
  assert.equal(getLanguageFromMime("application/sql", "test.sql"), "sql");
  assert.equal(getLanguageFromMime("application/x-sh", "test.sh"), "bash");
  assert.equal(getLanguageFromMime("application/x-sh", "test.bash"), "bash");
  assert.equal(getLanguageFromMime("application/yaml", "test.yml"), "yaml");
  assert.equal(getLanguageFromMime("application/yaml", "test.yaml"), "yaml");
  assert.equal(getLanguageFromMime("application/xml", "test.xml"), "xml");
  assert.equal(getLanguageFromMime("text/csv", "test.csv"), "csv");
});

test("getLanguageFromMime falls back to plaintext for unknown extensions", () => {
  assert.equal(getLanguageFromMime("text/plain", "test.unknown"), "plaintext");
  assert.equal(getLanguageFromMime("application/octet-stream", "test.bin"), "plaintext");
  assert.equal(getLanguageFromMime("text/plain", "test"), "plaintext");
});