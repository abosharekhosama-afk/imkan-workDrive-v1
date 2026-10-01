import assert from "node:assert/strict";
import test from "node:test";
import { isNativeImkanOfficeFile, officeEditorPath, resolveOfficeEditor } from "./office-file-routing.ts";

test("routes supported source formats to the correct editor", () => {
  assert.equal(resolveOfficeEditor("report.docx"), "writer");
  assert.equal(resolveOfficeEditor("book.xlsx"), "sheet");
  assert.equal(resolveOfficeEditor("deck.pptx"), "show");
});

test("routes native IMKAN Office files by their IMKAN mime type", () => {
  assert.equal(resolveOfficeEditor("report.imkan", "application/vnd.imkan.writer+json"), "writer");
  assert.equal(resolveOfficeEditor("book.imkan", "application/vnd.imkan.sheet+json"), "sheet");
  assert.equal(resolveOfficeEditor("deck.imkan", "application/vnd.imkan.show+json"), "show");
  assert.equal(isNativeImkanOfficeFile("report.imkan"), true);
});

test("unsupported files do not expose an Office route", () => {
  assert.equal(officeEditorPath("a/b", "archive.zip"), null);
  assert.equal(officeEditorPath("id with space", "book.csv"), "/office/sheet/id%20with%20space");
});
