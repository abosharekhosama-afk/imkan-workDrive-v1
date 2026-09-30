import assert from "node:assert/strict";
import test from "node:test";
import { parseMarkdown, safeMarkdownUrl } from "./markdown-preview-logic.ts";

test("markdown preview keeps document structure", () => {
  const blocks = parseMarkdown("# Title\n\nHello **bold** and *em* and `code`.\n\n- one\n- two\n\n> A quote\n\n```js\nconst a = 1\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n");
  assert.equal(blocks[0]?.kind, "heading");
  assert.equal(blocks[1]?.kind, "paragraph");
  assert.equal(blocks[2]?.kind, "list");
  assert.equal(blocks[3]?.kind, "quote");
  assert.equal(blocks[4]?.kind, "code");
  assert.equal(blocks[5]?.kind, "table");
  if (blocks[1]?.kind === "paragraph") {
    assert.deepEqual(blocks[1].inlines.map((part) => part.kind), ["text", "strong", "text", "em", "text", "code", "text"]);
  }
});

test("markdown preview rejects unsafe links", () => {
  assert.equal(safeMarkdownUrl("javascript:alert(1)"), null);
  const blocks = parseMarkdown("[click](javascript:alert(1)) [ok](https://example.com)");
  assert.equal(blocks[0]?.kind, "paragraph");
  if (blocks[0]?.kind === "paragraph") {
    assert.equal(blocks[0].inlines[0]?.kind, "text");
    assert.equal(blocks[0].inlines[1]?.kind, "link");
  }
});