import assert from "node:assert/strict";
import test from "node:test";
import { placeFloatingMenu } from "./overlay-bounds-logic.ts";

const view = { viewportWidth: 1000, viewportHeight: 800 };

test("opens on the inline end when that side has room", () => {
  const box = placeFloatingMenu({
    anchor: { top: 100, left: 200, right: 360, bottom: 136 },
    width: 220,
    height: 180,
    ...view,
    rtl: false,
  });
  assert.equal(box.left, 364);
  assert.equal(box.top, 100);
  assert.ok(box.left + 220 <= view.viewportWidth);
});

test("flips to the left when the right side is shorter than the menu", () => {
  const box = placeFloatingMenu({
    anchor: { top: 80, left: 820, right: 980, bottom: 116 },
    width: 220,
    height: 160,
    ...view,
    rtl: false,
  });
  assert.equal(box.left, 820 - 220 - 4);
  assert.ok(box.left >= 8);
});

test("RTL prefers the left of the anchor and flips right when that side is short", () => {
  const box = placeFloatingMenu({
    anchor: { top: 40, left: 12, right: 160, bottom: 76 },
    width: 220,
    height: 140,
    ...view,
    rtl: true,
  });
  assert.equal(box.left, 164);
  assert.ok(box.left + 220 <= view.viewportWidth - 8);
});

test("moves upward when the menu would pass the bottom edge", () => {
  const box = placeFloatingMenu({
    anchor: { top: 740, left: 200, right: 360, bottom: 776 },
    width: 220,
    height: 200,
    ...view,
  });
  assert.ok(box.top + box.maxHeight <= view.viewportHeight - 8);
  assert.ok(box.top >= 8);
});

test("keeps a short menu inside a short viewport", () => {
  const box = placeFloatingMenu({
    anchor: { top: 4, left: 4, right: 40, bottom: 40 },
    width: 300,
    height: 400,
    viewportWidth: 320,
    viewportHeight: 280,
  });
  assert.ok(box.left >= 8);
  assert.ok(box.top >= 8);
  assert.ok(box.top + box.maxHeight <= 280 - 8);
  assert.ok(box.left + Math.min(300, 320 - 16) <= 320);
});