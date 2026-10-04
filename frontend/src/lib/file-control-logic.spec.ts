import assert from "node:assert/strict";
import test from "node:test";
import { fileControlFromRecord } from "./file-control-logic.ts";

test("a final file stays final even when the status column is active", () => {
  assert.equal(fileControlFromRecord({ status: "ACTIVE", isFinal: true, checkedOutById: "user-1" }), "FINAL");
});

test("a checked-out file is locked when it is not final", () => {
  assert.equal(fileControlFromRecord({ status: "ACTIVE", isFinal: false, checkedOutById: "user-1" }), "CHECKED_OUT");
});

test("an ordinary active file stays active", () => {
  assert.equal(fileControlFromRecord({ status: "ACTIVE" }), "ACTIVE");
  assert.equal(fileControlFromRecord(null), "ACTIVE");
});

test("legacy status text still maps when the flags are missing", () => {
  assert.equal(fileControlFromRecord({ status: "checked out" }), "CHECKED_OUT");
  assert.equal(fileControlFromRecord({ status: "read-only" }), "FINAL");
});