import test from "node:test";
import assert from "node:assert/strict";
import { mapFileRecord, mapFolderRecord } from "./table-mappers.ts";

test("file creator (owner) is flattened for the Owner column with name fallback to email", () => {
  const mapped = mapFileRecord({
    id: "f1",
    name: "plan.pdf",
    owner: { id: "u1", name: "Sara", email: "sara@imkan.example", avatarUrl: null },
  });
  assert.equal(mapped.ownerId, "u1");
  assert.equal(mapped.ownerName, "Sara");
  assert.equal(mapped.ownerEmail, "sara@imkan.example");
  assert.equal(mapped.ownerAvatar, null);
});

test("creator with no display name falls back to the email so cells never render empty", () => {
  const mapped = mapFolderRecord({
    id: "g1",
    name: "Legal",
    createdBy: { id: "u2", name: null, email: "owner@imkan.example", avatarUrl: null },
  });
  assert.equal(mapped.ownerName, "owner@imkan.example");
  assert.equal(mapped.ownerId, "u2");
});

test("missing creator leaves display fields null instead of throwing", () => {
  const mapped = mapFileRecord({ id: "f2", name: "x" });
  assert.equal(mapped.ownerName, null);
  assert.equal(mapped.ownerEmail, null);
});