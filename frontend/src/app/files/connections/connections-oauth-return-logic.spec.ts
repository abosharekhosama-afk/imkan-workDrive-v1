import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCleanPathAfterOAuth,
  buildOAuthFailureMessage,
  buildOAuthStartReturnPath,
  buildOAuthSuccessMessage,
  isOAuthReturnSuccess,
  parseOAuthReturnParams,
} from "./connections-oauth-return-logic.ts";

test("successful OAuth return params are parsed safely", () => {
  const params = parseOAuthReturnParams("?oauth=success&provider=google&connectionId=conn-1");
  assert.equal(isOAuthReturnSuccess(params), true);
  assert.equal(params.provider, "google");
  assert.equal(params.connectionId, "conn-1");
  assert.equal(buildOAuthSuccessMessage(params.provider), "Google connection activated successfully.");
});

test("OAuth start return path strips prior oauth query params", () => {
  assert.equal(
    buildOAuthStartReturnPath("/files/connections", "?oauth=failed&provider=google&view=my"),
    "/files/connections?view=my",
  );
  assert.equal(buildCleanPathAfterOAuth("/files/connections", "?oauth=success&provider=google"), "/files/connections");
});

test("OAuth failure message uses backend message when present", () => {
  const params = parseOAuthReturnParams("?oauth=oauth_failed&provider=github&message=State%20expired");
  assert.equal(isOAuthReturnSuccess(params), false);
  assert.equal(buildOAuthFailureMessage(params), "State expired");
});
