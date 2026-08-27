import test from "node:test";
import assert from "node:assert/strict";
import { auditPath } from "./audit-path.ts";

test("auditPath is tenant-agnostic and omits orgId", () => {
  assert.equal(auditPath(), "/audit");
  assert.equal(auditPath().includes("orgId"), false);
});
