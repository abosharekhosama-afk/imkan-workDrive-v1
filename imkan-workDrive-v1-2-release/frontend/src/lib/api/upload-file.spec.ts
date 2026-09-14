import test from "node:test";
import assert from "node:assert/strict";
import { filesFromDrop } from "./drop-files.ts";

test("filesFromDrop reads dropped files without using client orgId", () => {
  const file = { name: "spec.pdf" } as File;
  const files = filesFromDrop({ files: [file] });
  assert.equal(files[0], file);
});
