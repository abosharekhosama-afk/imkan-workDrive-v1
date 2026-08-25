import test from "node:test";
import assert from "node:assert/strict";
import { isModalDismissKey } from "./modal-logic.ts";

test("modal dismisses only on Escape", () => {
  assert.equal(isModalDismissKey("Escape"), true);
  assert.equal(isModalDismissKey("Enter"), false);
});
