import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { officeEditorHref, officeExtensionOf, resolveOfficeEditorSegment } from "./office-editor-route.ts";

test("IMKAN Office document type decides the editor", () => {
  assert.equal(resolveOfficeEditorSegment({ documentType: "WRITER" }), "writer");
  assert.equal(resolveOfficeEditorSegment({ documentType: "SHEET" }), "sheet");
  assert.equal(resolveOfficeEditorSegment({ documentType: "SHOW" }), "show");
  assert.equal(resolveOfficeEditorSegment({ documentType: "sheet" }), "sheet");
});

test("template working copies resolve to the matching editor", () => {
  assert.equal(resolveOfficeEditorSegment({ documentType: "WRITER", fileName: "Contract.docx" }), "writer");
  assert.equal(resolveOfficeEditorSegment({ documentType: "SHEET", fileName: "Budget.xlsx" }), "sheet");
  assert.equal(resolveOfficeEditorSegment({ documentType: "SHOW", fileName: "Deck.pptx" }), "show");
});

test("extension and mime type are only fallback signals", () => {
  assert.equal(resolveOfficeEditorSegment({ fileName: "Budget.xlsx" }), "sheet");
  assert.equal(resolveOfficeEditorSegment({ fileName: "Deck.pptx" }), "show");
  assert.equal(resolveOfficeEditorSegment({ extension: ".docx" }), "writer");
  assert.equal(
    resolveOfficeEditorSegment({
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    "sheet",
  );
  assert.equal(officeExtensionOf("Quarterly Report.PPTX"), "pptx");
  assert.equal(officeExtensionOf("no-extension"), null);
});

test("documents that IMKAN Office cannot edit resolve to null", () => {
  assert.equal(resolveOfficeEditorSegment({}), null);
  assert.equal(resolveOfficeEditorSegment({ fileName: "Notes.txt", mimeType: "text/plain" }), null);
  assert.equal(resolveOfficeEditorSegment({ documentType: null, extension: "pdf" }), null);
  assert.equal(resolveOfficeEditorSegment({ documentType: "UNKNOWN", fileName: "Archive.zip" }), null);
});

test("officeEditorHref builds an existing editor route or nothing", () => {
  assert.equal(
    officeEditorHref({ fileId: "f1", documentType: "SHEET", templateId: "t1" }),
    "/office/sheet/f1?templateId=t1",
  );
  assert.equal(
    officeEditorHref({ fileId: "f2", documentType: "SHOW", templateId: "t/2" }),
    "/office/show/f2?templateId=t%2F2",
  );
  assert.equal(officeEditorHref({ fileId: "f3", documentType: "WRITER" }), "/office/writer/f3");
  assert.equal(officeEditorHref({ fileId: "f4", fileName: "Report.docx" }), "/office/writer/f4");
  assert.equal(officeEditorHref({ fileId: "f5", fileName: "Report.txt" }), null);
  assert.equal(officeEditorHref({ fileId: null, documentType: "WRITER" }), null);
  assert.equal(officeEditorHref({ fileId: "   ", documentType: "WRITER" }), null);
});

test("every editor the helper can return has a Next.js route on disk", () => {
  const segments = [
    resolveOfficeEditorSegment({ documentType: "WRITER" }),
    resolveOfficeEditorSegment({ documentType: "SHEET" }),
    resolveOfficeEditorSegment({ documentType: "SHOW" }),
  ];
  for (const segment of segments) {
    assert.ok(segment, "template document types must resolve to an editor");
    const route = join(import.meta.dirname, "..", "app", "office", segment, "[fileId]", "page.tsx");
    assert.equal(existsSync(route), true, `Edit Content would navigate to a missing route: ${route}`);
  }
});

test("Template Edit Content routes through the shared editor contract", () => {
  // Templates (list page) and Template Studio must not re-implement the
  // type → editor decision: only /office/writer|sheet|show exist.
  for (const page of ["templates/page.tsx", "templates/studio/[id]/page.tsx"]) {
    const source = readFileSync(join(import.meta.dirname, "..", "app", "files", page), "utf8");
    assert.match(source, /officeEditorHref/, `${page} must use the shared Office editor contract`);
    assert.doesNotMatch(source, /created\.office\?\.type === 'SHEET'/, `${page} must not inline the editor decision`);
  }
});
