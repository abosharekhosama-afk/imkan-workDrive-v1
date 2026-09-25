import test from "node:test";
import assert from "node:assert/strict";
import { connectionStatusLabel, friendlyConnectionError, parseConnectionError } from "./connection-picker-logic.ts";

test("labels active connections as connected", () => {
  assert.equal(connectionStatusLabel("ACTIVE"), "connected");
});

test("parses backend error codes", () => {
  assert.deepEqual(parseConnectionError("INSUFFICIENT_SCOPE: Reconnect to grant Google Drive file access."), {
    code: "INSUFFICIENT_SCOPE",
    message: "Reconnect to grant Google Drive file access.",
  });
});

test("maps insufficient scope to reconnect guidance", () => {
  assert.match(friendlyConnectionError("INSUFFICIENT_SCOPE: Reconnect to grant Google Drive file access."), /Reconnect/);
});
