import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAuthLoginNextPath,
  readBrowserAccessToken,
  readCookieAccessToken,
  shouldEndImkanSession,
} from "./auth-gate-logic.ts";

test("401 ends the IMKAN session but transient failures do not", () => {
  assert.equal(shouldEndImkanSession(401), true);
  assert.equal(shouldEndImkanSession(502), false);
  assert.equal(shouldEndImkanSession(503), false);
  assert.equal(shouldEndImkanSession(0), false);
});

test("login next path preserves oauth return query until auth is restored", () => {
  assert.equal(
    buildAuthLoginNextPath("/files/connections", "?oauth=success&provider=google"),
    "/files/connections?oauth=success&provider=google",
  );
});

test("browser session is restored from the first-party cookie when localStorage was not visible", () => {
  const storage = { getItem() { return null; } };
  const token = "header.payload.signature";
  assert.equal(readCookieAccessToken("workdrive_access_token=" + encodeURIComponent(token)), token);
  assert.equal(readBrowserAccessToken(storage, "theme=dark; workdrive_access_token=" + encodeURIComponent(token)), token);
});

test("localStorage token wins over the cookie", () => {
  const storage = { getItem(key) { return key === "workdrive_access_token" ? "local-token" : null; } };
  assert.equal(readBrowserAccessToken(storage, "workdrive_access_token=cookie-token"), "local-token");
});
