import test from "node:test";
import assert from "node:assert/strict";
import { TOKEN_STORAGE_KEY, isDevelopment } from "./dev-auth-toolbar-logic.ts";

test("uses the existing token key and development boundary", () => {
  assert.equal(TOKEN_STORAGE_KEY, "workdrive_access_token");
  assert.equal(isDevelopment(), true);
});
