import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clampBoxLeft, contentLane, placeCardInScrollFrame } from "./overlay-bounds-logic.ts";

describe("contentLane", () => {
  it("keeps cards to the right of a left sidebar", () => {
    const lane = contentLane(1440, { left: 0, right: 264, width: 264 });
    assert.equal(lane.left, 272);
    assert.equal(lane.right, 1432);
  });

  it("keeps cards to the left of a right sidebar", () => {
    const lane = contentLane(1440, { left: 1176, right: 1440, width: 264 });
    assert.equal(lane.left, 8);
    assert.equal(lane.right, 1168);
  });

  it("uses the viewport when the sidebar is hidden", () => {
    const lane = contentLane(800, null);
    assert.equal(lane.left, 8);
    assert.equal(lane.right, 792);
  });

  it("stays between a primary sidebar and a secondary sidebar", () => {
    const lane = contentLane(1440, [
      { left: 0, right: 264, width: 264 },
      { left: 264, right: 488, width: 224 },
    ]);
    assert.equal(lane.left, 496);
    assert.equal(lane.right, 1432);
  });

  it("stays clear of a right-side inspector as well", () => {
    const lane = contentLane(1440, [
      { left: 0, right: 264, width: 264 },
      { left: 1080, right: 1440, width: 360 },
    ]);
    assert.equal(lane.left, 272);
    assert.equal(lane.right, 1072);
  });

  it("keeps cards left of stacked right sidebars", () => {
    const lane = contentLane(1440, [
      { left: 1176, right: 1440, width: 264 },
      { left: 952, right: 1176, width: 224 },
    ]);
    assert.equal(lane.left, 8);
    assert.equal(lane.right, 944);
  });
});

describe("clampBoxLeft", () => {
  it("stops a card at the sidebar edge", () => {
    const lane = contentLane(1200, { left: 0, right: 260, width: 260 });
    assert.equal(clampBoxLeft(10, 280, lane), 268);
    assert.equal(clampBoxLeft(1000, 280, lane), 912);
  });
});
describe("placeCardInScrollFrame", () => {
  it("keeps a tall card below the table header and extends a short table", () => {
    const placed = placeCardInScrollFrame({
      anchor: { top: 220, left: 800, right: 832, bottom: 252 },
      width: 252,
      height: 480,
      frameTop: 180,
      frameBottom: 640,
      frameLeft: 240,
      frameRight: 1200,
      scrollTop: 0,
      scrollLeft: 0,
      stickyTop: 40,
      contentHeight: 160,
      align: "end",
    });
    assert.ok(placed.top >= 40);
    assert.equal(placed.top, 76);
    assert.equal(placed.left, 340);
    assert.equal(placed.scrollPadding, 404);
  });

  it("does not open a card above the table when the row is near the header", () => {
    const placed = placeCardInScrollFrame({
      anchor: { top: 480, left: 400, right: 432, bottom: 512 },
      width: 252,
      height: 500,
      frameTop: 180,
      frameBottom: 400,
      frameLeft: 0,
      frameRight: 900,
      scrollTop: 0,
      scrollLeft: 0,
      stickyTop: 40,
      contentHeight: 220,
      align: "end",
    });
    assert.ok(placed.top >= 40);
    assert.equal(placed.top, 336);
    assert.ok(placed.scrollPadding > 0);
  });

  it("adds no extra scroll when the table already contains the card", () => {
    const placed = placeCardInScrollFrame({
      anchor: { top: 240, left: 500, right: 532, bottom: 272 },
      width: 252,
      height: 180,
      frameTop: 180,
      frameBottom: 800,
      frameLeft: 0,
      frameRight: 1000,
      scrollTop: 0,
      scrollLeft: 0,
      stickyTop: 36,
      contentHeight: 2000,
      align: "end",
    });
    assert.equal(placed.scrollPadding, 0);
  });
});
