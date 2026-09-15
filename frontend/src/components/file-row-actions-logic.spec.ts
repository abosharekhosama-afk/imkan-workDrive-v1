import test from "node:test";
import assert from "node:assert/strict";
import { buildFileRowActions, permissionAllowsEdit } from "./file-row-actions-logic.ts";

test("VIEW-granted files expose open/preview/details with download allowed by default", () => {
  const ids = buildFileRowActions({
    resourceType: "FILE",
    permission: "VIEW",
    canMutate: false,
    canShare: false,
  });
  assert.deepEqual(ids, ["open", "preview", "details", "download", "versions"]);
});

test("canDownload=false strips download for VIEW recipients", () => {
  const ids = buildFileRowActions({
    resourceType: "FILE",
    permission: "VIEW",
    canDownload: false,
    canMutate: false,
    canShare: false,
  });
  assert.deepEqual(ids, ["open", "preview", "details", "versions"]);
});

test("EDIT-granted files unlock share/rename/move/delete and favorites", () => {
  const ids = buildFileRowActions({
    resourceType: "FILE",
    permission: "EDIT",
    canMutate: true,
    canShare: true,
    isFavorite: true,
    canFavorite: true,
  });
  assert.deepEqual(ids, [
    "open",
    "preview",
    "details",
    "download",
    "versions",
    "share",
    "rename",
    "move",
    "unfavorite",
    "delete",
  ]);
});

test("owner context (no share permission) keeps full control", () => {
  const ids = buildFileRowActions({
    resourceType: "FILE",
    canMutate: true,
    canShare: true,
    canFavorite: true,
  });
  assert.deepEqual(ids, [
    "open",
    "preview",
    "details",
    "download",
    "versions",
    "share",
    "rename",
    "move",
    "favorite",
    "delete",
  ]);
});

test("folders never expose preview/download, edit actions follow permission", () => {
  const viewIds = buildFileRowActions({
    resourceType: "FOLDER",
    permission: "VIEW",
    canMutate: false,
    canShare: false,
  });
  assert.deepEqual(viewIds, ["open"]);

  const editIds = buildFileRowActions({
    resourceType: "FOLDER",
    canMutate: true,
    canShare: true,
  });
  assert.deepEqual(editIds, ["open", "share", "rename", "move", "delete"]);
});

test("delete is always the last offered action", () => {
  const ids = buildFileRowActions({
    resourceType: "FILE",
    permission: "EDIT",
    canMutate: true,
    canShare: true,
    canFavorite: true,
  });
  assert.equal(ids[ids.length - 1], "delete");
});

test("permissionAllowsEdit matches edit-capable share roles only", () => {
  assert.equal(permissionAllowsEdit(null), true);
  assert.equal(permissionAllowsEdit(undefined), true);
  assert.equal(permissionAllowsEdit("VIEW"), false);
  assert.equal(permissionAllowsEdit("COMMENT"), false);
  assert.equal(permissionAllowsEdit("EDIT"), true);
  assert.equal(permissionAllowsEdit("FULL_ACCESS"), true);
  assert.equal(permissionAllowsEdit("ORGANIZE"), true);
});

