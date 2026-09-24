import assert from "node:assert/strict";
import test from "node:test";
import { authGatePhase, readOAuthResumeToken, shouldRedirectToLogin } from "./auth-gate-logic.ts";
import { connectionActions, connectionStatusLabel, friendlyConnectionError } from "./connection-picker-logic.ts";

test("oauth resume code is read from the fragment and an access token is not accepted there", () => {
  assert.equal(readOAuthResumeToken("#imkan_resume=abcdefghijklmnopqrstuvwxyz"), "abcdefghijklmnopqrstuvwxyz");
  assert.equal(readOAuthResumeToken("#imkan_session=abcdefghijklmnopqrstuvwxyz"), null);
  assert.equal(readOAuthResumeToken(""), null);
});

test("auth gate stays loading until the session check finishes", () => {
  assert.equal(authGatePhase({ exchanging: true, hasToken: false, meStatus: null }), "loading");
  assert.equal(shouldRedirectToLogin("loading"), false);
  assert.equal(authGatePhase({ exchanging: false, hasToken: true, meStatus: null }), "loading");
  assert.equal(authGatePhase({ exchanging: false, hasToken: false, meStatus: null }), "unauthenticated");
  assert.equal(shouldRedirectToLogin("unauthenticated"), true);
  assert.equal(authGatePhase({ exchanging: false, hasToken: true, meStatus: 200 }), "authenticated");
});

test("connection picker only offers actions the provider can execute", () => {
  assert.deepEqual(connectionActions("google"), ["get_file", "upload"]);
  assert.deepEqual(connectionActions("stripe"), []);
  assert.equal(connectionStatusLabel("ACTIVE"), "connected");
  assert.equal(connectionStatusLabel("REAUTH_REQUIRED"), "expired");
  assert.equal(friendlyConnectionError("invalid_grant"), "Your connection expired.");
});
