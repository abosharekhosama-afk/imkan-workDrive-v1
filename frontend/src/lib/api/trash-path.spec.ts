import test from "node:test";
import assert from "node:assert/strict";
import { restorePath, trashPath } from "./trash-path.ts";

test("trash and restore paths never include orgId", () => {
  assert.equal(trashPath(), "/files/trash");
  assert.equal(restorePath("00000000-0000-4000-8000-000000000021"), "/files/00000000-0000-4000-8000-000000000021/restore");
  assert.equal(trashPath().includes("orgId"), false);
});
