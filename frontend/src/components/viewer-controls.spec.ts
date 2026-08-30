import test from "node:test";
import assert from "node:assert/strict";
import { canManageMembers, canMutateContent, canShareContent } from "../lib/permissions.ts";

test("VIEWER role hides mutate, share, and member management controls", () => {
  assert.equal(canMutateContent("VIEWER"), false);
  assert.equal(canShareContent("VIEWER"), false);
  assert.equal(canManageMembers("VIEWER"), false);
});

test("readOnly flag hides mutate, share, and member management controls regardless of role", () => {
  assert.equal(canMutateContent("ADMIN", true), false);
  assert.equal(canShareContent("EDITOR", true), false);
  assert.equal(canManageMembers("ORGANIZER", true), false);
});

test("EDITOR role allows mutate and share but hides member management", () => {
  assert.equal(canMutateContent("EDITOR"), true);
  assert.equal(canShareContent("EDITOR"), true);
  assert.equal(canManageMembers("EDITOR"), false);
});

test("ORGANIZER role allows mutate, share, and member management", () => {
  assert.equal(canMutateContent("ORGANIZER"), true);
  assert.equal(canShareContent("ORGANIZER"), true);
  assert.equal(canManageMembers("ORGANIZER"), true);
});

test("ADMIN and ORG_ADMIN roles allow all actions", () => {
  assert.equal(canMutateContent("ADMIN"), true);
  assert.equal(canShareContent("ADMIN"), true);
  assert.equal(canManageMembers("ADMIN"), true);

  assert.equal(canMutateContent("ORG_ADMIN"), true);
  assert.equal(canShareContent("ORG_ADMIN"), true);
  assert.equal(canManageMembers("ORG_ADMIN"), true);
});

test("Personal folders (role undefined) allow content mutate and share, but hide member management", () => {
  assert.equal(canMutateContent(undefined), true);
  assert.equal(canShareContent(undefined), true);
  assert.equal(canManageMembers(undefined), false);
});
