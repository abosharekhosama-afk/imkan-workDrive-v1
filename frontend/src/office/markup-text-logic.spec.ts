import assert from "node:assert/strict";
import test from "node:test";
import { visibleMarkupText } from "./markup-text-logic.ts";

const cell = `<w:tcPr><w:cnfStyle w:val="001000000000" w:firstRow="0" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:oddVBand="0" w:evenVBand="0" w:oddHBand="0" w:evenHBand="0" w:firstRowFirstColumn="0" w:firstRowLastColumn="0" w:lastRowFirstColumn="0" w:lastRowLastColumn="0"/><w:tcW w:w="2828" w:type="dxa"/></w:tcPr><w:p w14:paraId="4D1616EC" w14:textId="77777777" w:rsidR="00507AFD" w:rsidRDefault="00507AFD" w:rsidP="00A21D13"><w:pPr><w:bidi w:val="0"/><w:jc w:val="center"/><w:rPr><w:rFonts w:hint="cs"/><w:rtl/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:hint="cs"/><w:rtl/></w:rPr><w:t>التخصص</w:t></w:r></w:p>`;

test("table cell markup collapses to the visible word", () => {
  assert.equal(visibleMarkupText(cell), "التخصص");
});

test("an unclosed text tag still leaves the visible word", () => {
  assert.equal(visibleMarkupText(cell.replace("</w:t></w:r></w:p>", "")), "التخصص");
});

test("ordinary text and comparisons stay unchanged", () => {
  assert.equal(visibleMarkupText("التخصص"), "التخصص");
  assert.equal(visibleMarkupText("a < b"), "a < b");
});

test("drawing text is read from a:t and not from a:tc", () => {
  assert.equal(visibleMarkupText(`<a:tc><a:txBody><a:p><a:r><a:t>عنوان</a:t></a:r></a:p></a:txBody></a:tc>`), "عنوان");
});