import test from "node:test";
import assert from "node:assert/strict";
import { readBrowserAccessToken, readCookieAccessToken, shouldEndImkanSession } from "./auth-gate-logic.ts";

test("OAuth return keeps the IMKAN session unless /auth/me is 401", () => {
  assert.equal(shouldEndImkanSession(401), true);
  assert.equal(shouldEndImkanSession(403), false);
  assert.equal(shouldEndImkanSession(502), false);
  assert.equal(shouldEndImkanSession(0), false);
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