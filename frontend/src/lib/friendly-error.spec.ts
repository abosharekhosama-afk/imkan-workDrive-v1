import test from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "./api/client.ts";
import { errorCodeOf, friendlyErrorMessageKey } from "./friendly-error.ts";

test("friendlyErrorMessageKey maps 403 and rbac codes to the permission message", () => {
  assert.equal(friendlyErrorMessageKey(new ApiError(403, "nope")), "error.permissionDenied");
  assert.equal(friendlyErrorMessageKey(new ApiError(403, "x", "INSUFFICIENT_PERMISSIONS")), "error.permissionDenied");
  assert.equal(friendlyErrorMessageKey(new ApiError(500, "x", "RBAC_DENIED")), "error.permissionDenied");
});

test("friendlyErrorMessageKey maps 401 to unauthenticated", () => {
  assert.equal(friendlyErrorMessageKey(new ApiError(401, "missing")), "error.unauthenticated");
  assert.equal(friendlyErrorMessageKey(new ApiError(500, "x", "UNAUTHENTICATED")), "error.unauthenticated");
});

test("friendlyErrorMessageKey falls back to generic for unrelated failures", () => {
  assert.equal(friendlyErrorMessageKey(new ApiError(500, "boom")), "error.generic");
  assert.equal(friendlyErrorMessageKey(new Error("boom")), "error.generic");
  assert.equal(friendlyErrorMessageKey(undefined), "error.generic");
});

test("errorCodeOf reads a structured code from arbitrary thrown values", () => {
  assert.equal(errorCodeOf(new ApiError(403, "no", "FORBIDDEN")), "FORBIDDEN");
  assert.equal(errorCodeOf({ code: "X" }), "X");
  assert.equal(errorCodeOf({ code: "" }), null);
  assert.equal(errorCodeOf("noise"), null);
});