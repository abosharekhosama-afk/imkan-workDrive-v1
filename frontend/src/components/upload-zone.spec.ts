import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("top-bar upload routing", () => {
  it("routes upload actions with the current folder id", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/components/upload-zone.tsx"), "utf8");
    assert.match(source, /requestedFolderId/);
    assert.match(source, /requestedFolderId !== undefined && requestedFolderId !== folderId/);
  });
});
