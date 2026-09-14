import test from "node:test";
import assert from "node:assert/strict";
import { aggregateFolderSize, formatDateLocalized, latestOf } from "./localized.ts";

test("formatDateLocalized renders Arabic dates via ar-EG and degrades safely", () => {
  const fixed = new Date(2024, 4, 21, 13, 45).toISOString();
  assert.equal(formatDateLocalized(null, "en"), "—");
  assert.equal(formatDateLocalized("not-a-date", "en"), "—");
  const en = formatDateLocalized(fixed, "en");
  const ar = formatDateLocalized(fixed, "ar");
  assert.equal(typeof en, "string");
  assert.ok(en.length > 0);
  assert.notEqual(ar, en); // localized numerals/labels differ
});

test("latestOf picks the newest ISO timestamp", () => {
  assert.equal(latestOf("2024-01-01T00:00:00Z", "2024-06-01T00:00:00Z"), "2024-06-01T00:00:00Z");
  assert.equal(latestOf("2024-06-01T00:00:00Z", "2024-01-01T00:00:00Z"), "2024-06-01T00:00:00Z");
  assert.equal(latestOf(null, "2024-01-01T00:00:00Z"), "2024-01-01T00:00:00Z");
  assert.equal(latestOf("2024-01-01T00:00:00Z", undefined), "2024-01-01T00:00:00Z");
});

test("aggregateFolderSize sums active file sizes per folder", () => {
  const sizeOf = aggregateFolderSize([
    { folderId: "a", size: 100 },
    { folderId: "a", size: 50 },
    { folderId: "b", size: 25 },
    { folderId: undefined, size: 999 }, // root file with no folder
  ]);
  assert.equal(sizeOf("a"), 150);
  assert.equal(sizeOf("b"), 25);
  assert.equal(sizeOf("c"), 0);
});