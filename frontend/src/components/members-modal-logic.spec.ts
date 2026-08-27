import test from "node:test";
import assert from "node:assert/strict";
import {
  apiErrorCode,
  availableOrgMembers,
  displayNameOf,
  filterMembersByQuery,
  initialsOf,
  membershipErrorKey,
} from "./members-modal-logic.ts";

const ORG_MEMBERS = [
  { userId: "u1", name: "Sara Ahmed", email: "sara@imkan.example", avatarUrl: null, status: "ACTIVE" },
  { userId: "u2", name: null, email: "omar@imkan.example", avatarUrl: null, status: "ACTIVE" },
  { userId: "u3", name: "Lina", email: "lina@imkan.example", avatarUrl: null, status: "SUSPENDED" },
];

test("availableOrgMembers excludes assigned and non-active members", () => {
  const options = availableOrgMembers(ORG_MEMBERS, [{ userId: "u1" }]);
  assert.deepEqual(
    options.map((m) => m.userId),
    ["u2"],
  );
});

test("filterMembersByQuery matches name or email case-insensitively", () => {
  assert.equal(filterMembersByQuery(ORG_MEMBERS, "OMAR").length, 1);
  assert.equal(filterMembersByQuery(ORG_MEMBERS, "sara").length, 1);
  assert.equal(filterMembersByQuery(ORG_MEMBERS, "zzz").length, 0);
});

test("membershipErrorKey prefers API codes over HTTP status fallbacks", () => {
  assert.equal(membershipErrorKey(500, "MEMBER_ALREADY_EXISTS"), "teamFolders.member.error.MEMBER_ALREADY_EXISTS");
  assert.equal(membershipErrorKey(401, undefined), "error.unauthenticated");
  assert.equal(membershipErrorKey(403, null), "error.forbidden");
  assert.equal(membershipErrorKey(400, "UNKNOWN_CODE"), null);
  assert.equal(apiErrorCode(new Error("plain")), null);
  assert.equal(apiErrorCode(Object.assign(new Error("x"), { code: "" })), null);
});

test("display name and avatar helpers stay safe for empty values", () => {
  assert.equal(displayNameOf({ name: null, email: "omar@imkan.example" }), "omar");
  assert.equal(displayNameOf({ name: "Sara", email: "sara@imkan.example" }), "Sara");
  assert.equal(initialsOf("sara@imkan"), "SA");
  assert.equal(initialsOf(""), "?");
});