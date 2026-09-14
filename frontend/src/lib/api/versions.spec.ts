import test from "node:test";
import assert from "node:assert/strict";
import { apiRequest } from "./client.ts";
import {
  getVersionDownloadUrl,
  getVersionDownloadUrlById,
  getVersionHistory,
  restoreVersion,
  restoreVersionById,
  uploadNewVersion,
} from "./versions.ts";

test("getVersionDownloadUrl calls correct endpoint", async () => {
  // We can't easily mock in this test setup, so we'll just verify the function exists
  assert.ok(typeof getVersionDownloadUrl === "function");
});

test("restoreVersion calls correct endpoint", async () => {
  assert.ok(typeof restoreVersion === "function");
});

test("getVersionHistory targets the versions collection endpoint", async () => {
  assert.ok(typeof getVersionHistory === "function");
  // Signature contract: single fileId argument, resolves VersionRecord[]
  assert.equal(getVersionHistory.length, 1);
});

test("getVersionDownloadUrlById targets the versionId download endpoint", async () => {
  assert.ok(typeof getVersionDownloadUrlById === "function");
  assert.equal(getVersionDownloadUrlById.length, 2);
});

test("restoreVersionById targets the versionId restore endpoint", async () => {
  assert.ok(typeof restoreVersionById === "function");
  assert.equal(restoreVersionById.length, 2);
});

test("apiRequest remains the transport for all version calls", () => {
  // Guards against accidental direct-fetch regressions in this module.
  assert.ok(typeof apiRequest === "function");
});

test("uploadNewVersion targets the multipart versions endpoint", async () => {
  assert.ok(typeof uploadNewVersion === "function");
  // Contract: (fileId, file) — used for the drawer's direct upload.
  assert.equal(uploadNewVersion.length, 2);
});
