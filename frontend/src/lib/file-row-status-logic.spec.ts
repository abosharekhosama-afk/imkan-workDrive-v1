import assert from "node:assert/strict";
import test from "node:test";
import { collapsedLabels, rowExpiryMark, shareExpiryMark } from "./file-row-status-logic.ts";

const now = Date.parse("2026-10-04T00:00:00.000Z");

test("collapses extra labels and keeps the real color", () => {
  const labels = [
    { id: "a", name: "Legal", color: "#175cd3" },
    { id: "a", name: "Legal", color: "#175cd3" },
    { id: "b", name: "Finance", color: "#b54708" },
    { id: "c", name: "Archive", color: "#027a48" },
  ];
  const result = collapsedLabels(labels, 2);
  assert.deepEqual(result.shown.map((item) => item.id), ["a", "b"]);
  assert.equal(result.shown[0]?.color, "#175cd3");
  assert.deepEqual(result.hidden.map((item) => item.name), ["Archive"]);
});

test("a missing or future share date is not expired", () => {
  assert.equal(shareExpiryMark(null, now), null);
  assert.equal(shareExpiryMark(undefined, now), null);
  assert.equal(shareExpiryMark("2026-12-01T00:00:00.000Z", now), null);
  assert.equal(rowExpiryMark("ACTIVE", "2026-12-01T00:00:00.000Z", now), null);
  assert.equal(rowExpiryMark(null, null, now), null);
});

test("a share that already expired exposes the real timestamp", () => {
  const mark = rowExpiryMark("ACTIVE", "2026-09-01T00:00:00.000Z", now);
  assert.equal(mark?.at, "2026-09-01T00:00:00.000Z");
});

test("an explicit expired status is marked even without a past share date", () => {
  const mark = rowExpiryMark("EXPIRED", null, now);
  assert.deepEqual(mark, { at: null });
});