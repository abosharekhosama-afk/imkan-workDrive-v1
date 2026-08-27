import test from "node:test";
import assert from "node:assert/strict";
import { fileIconSymbol } from "./file-icon-logic.ts";

test("file icons classify supported file kinds without exposing file data", () => {
  assert.equal(fileIconSymbol("folder"), "▰");
  assert.equal(fileIconSymbol("file", "application/pdf", "report.pdf"), "▤");
  assert.equal(fileIconSymbol("file", "image/png", "photo.png"), "▧");
});
