import test from "node:test";
import assert from "node:assert/strict";
import { searchPath } from "./search-path.ts";

test("searchPath uses q only and never sends orgId", () => {
  const path = searchPath("spec.pdf");
  assert.equal(path, "/search?q=spec.pdf");
  assert.equal(path.includes("orgId"), false);
  assert.equal(path.includes("org_id"), false);
});
