import assert from "node:assert/strict";
import test from "node:test";
import { imkanContentToUniverSnapshot } from "./imkan-to-univer.ts";

test("writer text is anchored on the paragraph break Univer draws", () => {
  const snapshot = imkanContentToUniverSnapshot({
    type: "WRITER",
    title: "Report",
    blocks: [{ type: "paragraph", runs: [{ text: "Hello Univer" }] }],
  }, "writer", "Report");
  const body = snapshot?.body as { dataStream: string; paragraphs: Array<{ startIndex: number }> };
  assert.equal(body.dataStream, "Hello Univer\r\n");
  assert.equal(body.paragraphs[0].startIndex, "Hello Univer".length);
  assert.equal(body.dataStream[body.paragraphs[0].startIndex], "\r");
});

test("sheet cells land on the Univer grid", () => {
  const snapshot = imkanContentToUniverSnapshot({
    type: "SHEET",
    title: "Budget",
    sheets: [{ id: "sheet-1", name: "Sheet1", cells: { A1: { value: "Rent" }, B2: { value: 42 } } }],
  }, "sheet", "Budget");
  const sheet = (snapshot?.sheets as any)["sheet-1"];
  assert.equal(sheet.cellData[0][0].v, "Rent");
  assert.equal(sheet.cellData[1][1].v, 42);
  assert.ok(sheet.columnCount >= 26);
});