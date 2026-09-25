import test from "node:test";
import assert from "node:assert/strict";
import { connectionBrowseReady, connectionStatusLabel, friendlyConnectionError, googleDriveReconnectRequired, parseConnectionError, reconnectProviderLabel } from "./connection-picker-logic.ts";

test("labels active connections as connected", () => {
  assert.equal(connectionStatusLabel("ACTIVE"), "connected");
});

test("parses backend error codes", () => {
  assert.deepEqual(parseConnectionError("INSUFFICIENT_SCOPE: Google Drive file access is not authorized for this connection."), {
    code: "INSUFFICIENT_SCOPE",
    message: "Google Drive file access is not authorized for this connection.",
  });
});

test("maps insufficient scope to reconnect guidance", () => {
  assert.match(friendlyConnectionError("INSUFFICIENT_SCOPE: Google Drive file access is not authorized for this connection."), /not authorized/);
});

test("detects google drive reconnect requirement", () => {
  assert.equal(googleDriveReconnectRequired({ provider: "google", authType: "OAUTH2", status: "ACTIVE", scope: "openid email", errorCode: "DRIVE_SCOPE_REQUIRED" }), true);
  assert.equal(connectionBrowseReady({ provider: "google", authType: "OAUTH2", status: "ACTIVE", scope: "openid email", errorCode: "DRIVE_SCOPE_REQUIRED" }), false);
});

test("uses provider-specific reconnect label", () => {
  assert.equal(reconnectProviderLabel("google"), "Reconnect Google Drive");
});
