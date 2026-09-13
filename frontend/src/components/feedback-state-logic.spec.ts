import test from "node:test";
import assert from "node:assert/strict";
import { errorMessageForStatus, isEmptyResult } from "./feedback-state-logic.ts";

test("maps safe API statuses without exposing implementation details", () => {
  const labels = { unauthenticated: "Sign in", forbidden: "No access", generic: "Try again" };
  assert.equal(errorMessageForStatus(401, labels), "Sign in");
  assert.equal(errorMessageForStatus(403, labels), "No access");
  assert.equal(errorMessageForStatus(500, labels), "Try again");
  assert.equal(errorMessageForStatus(undefined, labels), "Try again");
});

test("identifies only genuinely empty collections", () => {
  assert.equal(isEmptyResult(0), true);
  assert.equal(isEmptyResult(1), false);
});
