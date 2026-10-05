import assert from "node:assert/strict";
import test from "node:test";
import { ensureUniverDocSnapshot, imkanContentToUniverSnapshot } from "./imkan-to-univer.ts";

test("writer text is anchored on the paragraph break Univer draws", () => {
  const snapshot = imkanContentToUniverSnapshot({
    type: "WRITER",
    title: "Report",
    blocks: [{ type: "paragraph", runs: [{ text: "Hello Univer" }] }],
  }, "writer", "Report");
  const body = snapshot?.body as { dataStream: string; paragraphs: Array<{ startIndex: number }>; textRuns: Array<{ st: number; ed: number }> };
  assert.equal(body.dataStream, "Hello Univer\r\n");
  assert.equal(body.paragraphs[0].startIndex, "Hello Univer".length);
  assert.equal(body.dataStream[body.paragraphs[0].startIndex], "\r");
  assert.equal(body.textRuns[0].st, 0);
  assert.equal(body.textRuns[0].ed, "Hello Univer".length);
  assert.equal(body.dataStream[body.textRuns[0].ed], "\r");
});

test("a saved document without glyph runs gets them before the first keystroke", () => {
  const ready = ensureUniverDocSnapshot({
    title: "Notes",
    body: {
      dataStream: "Visible text\r\n",
      textRuns: [],
      paragraphs: [{ startIndex: 12 }],
      sectionBreaks: [{ startIndex: 13 }],
    },
  });
  const body = ready.body as { textRuns: Array<{ st: number; ed: number }> };
  assert.equal(body.textRuns.length, 1);
  assert.equal(body.textRuns[0].st, 0);
  assert.equal(body.textRuns[0].ed, 12);
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

test("slides use the 0.25 page order and paint text at page scale", () => {
  const snapshot = imkanContentToUniverSnapshot({
    type: "SHOW",
    title: "Deck",
    slides: [{
      id: "slide-1",
      background: "#ffffff",
      elements: [{ id: "t1", type: "text", x: 10, y: 20, width: 50, height: 15, text: "Hello slide", fontSize: 28 }],
    }],
  }, "show", "Deck");
  const body = snapshot?.body as { pageOrder: string[]; pages: Record<string, any> };
  assert.deepEqual(body.pageOrder, ["slide-1"]);
  const element = body.pages["slide-1"].pageElements.t1;
  assert.equal(element.type, 2);
  assert.equal(element.richText.text, "Hello slide");
  assert.equal(element.left, 96);
  assert.equal(element.top, 108);
  assert.equal(element.width, 480);
  assert.equal(element.height, 81);
});