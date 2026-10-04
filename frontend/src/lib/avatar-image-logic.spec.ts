import assert from "node:assert/strict";
import test from "node:test";
import { avatarFileAllowed, fitAvatarSize } from "./avatar-image-logic.ts";

test("large portraits shrink to the avatar edge", () => {
  assert.deepEqual(fitAvatarSize(800, 400), { width: 256, height: 128 });
  assert.deepEqual(fitAvatarSize(120, 80), { width: 120, height: 80 });
});

test("only jpeg png and webp under 5 MB are accepted", () => {
  assert.equal(avatarFileAllowed("image/png", 1200), true);
  assert.equal(avatarFileAllowed("image/gif", 1200), false);
  assert.equal(avatarFileAllowed("image/jpeg", 6000000), false);
});