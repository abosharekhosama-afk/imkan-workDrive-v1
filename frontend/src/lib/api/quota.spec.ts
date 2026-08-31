import test from "node:test";
import assert from "node:assert/strict";
import { formatBytes, normalizeQuota, resolveItemSize, type QuotaOverview } from "./quota.ts";

test("formatBytes renders human-readable sizes across unit ranges", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1024), "1.0 KB");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(1024 * 1024 * 1.4), "1.4 MB");
  assert.equal(formatBytes(1024 ** 3 * 27.3), "27.3 GB");
});

test("formatBytes degrades gracefully on invalid input", () => {
  assert.equal(formatBytes(null), "—");
  assert.equal(formatBytes(undefined), "—");
  assert.equal(formatBytes(Number.NaN), "—");
  assert.equal(formatBytes(-4), "—");
});

test("resolveItemSize reads size, byteSize or bytes and normalises", () => {
  assert.equal(resolveItemSize({ size: 1536 }), 1536);
  assert.equal(resolveItemSize({ byteSize: 420 * 1024 }), 420 * 1024);
  assert.equal(resolveItemSize({ bytes: "2048" }), 2048);
  // precedence: size wins, then byteSize, then bytes
  assert.equal(resolveItemSize({ size: 1, byteSize: 2, bytes: 3 }), 1);
  assert.equal(resolveItemSize({ byteSize: 2, bytes: 3 }), 2);
  assert.equal(resolveItemSize({ bytes: 3 }), 3);
  // unknown / invalid values
  assert.equal(resolveItemSize(null), null);
  assert.equal(resolveItemSize(undefined), null);
  assert.equal(resolveItemSize({}), null);
  assert.equal(resolveItemSize({ size: null, byteSize: null, bytes: null }), null);
  assert.equal(resolveItemSize({ size: "NaN" }), null);
  assert.equal(resolveItemSize({ size: -1 }), null);
});

test("normalizeQuota maps the /storage/quota payload to the overview contract", () => {
  const overview: QuotaOverview = normalizeQuota({
    quotaBytes: "10737418240",
    usedBytes: "5368709120",
  });
  assert.equal(overview.scope, "ORGANIZATION");
  assert.equal(overview.buckets.total.usedBytes, 5368709120);
  assert.equal(overview.buckets.total.quotaBytes, 10737418240);
  assert.equal(overview.unlimited, false);
  assert.equal(overview.usedPercent, 50);
});

test("normalizeQuota treats a missing ceiling as unlimited", () => {
  const overview = normalizeQuota({ usedBytes: 42 });
  assert.equal(overview.unlimited, true);
  assert.equal(overview.usedPercent, 0);
});

test("normalizeQuota keeps pre-computed percentages and clamps overflow", () => {
  assert.equal(normalizeQuota({ usedPercent: 133, quotaBytes: 10, usedBytes: 99 }).usedPercent, 100);
  assert.equal(normalizeQuota({ unlimited: true, quotaBytes: 10 }).unlimited, true);
});

