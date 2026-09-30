import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clampBoxLeft, contentLane } from "./overlay-bounds-logic.ts";

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
});

describe("clampBoxLeft", () => {
  it("stops a card at the sidebar edge", () => {
    const lane = contentLane(1200, { left: 0, right: 260, width: 260 });
    assert.equal(clampBoxLeft(10, 280, lane), 268);
    assert.equal(clampBoxLeft(1000, 280, lane), 912);
  });
});