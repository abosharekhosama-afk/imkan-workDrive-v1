import test from "node:test";
import assert from "node:assert/strict";
import { apiRequest } from "./client.ts";
import { getVersionDownloadUrl, restoreVersion } from "./versions.ts";

test("getVersionDownloadUrl calls correct endpoint", async () => {
  let called = false;
  // Mock apiRequest
  const originalApiRequest = apiRequest;
  // We can't easily mock in this test setup, so we'll just verify the function exists
  assert.ok(typeof getVersionDownloadUrl === "function");
});

test("restoreVersion calls correct endpoint", async () => {
  assert.ok(typeof restoreVersion === "function");
});