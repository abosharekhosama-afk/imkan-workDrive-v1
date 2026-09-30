import assert from "node:assert/strict";
import test from "node:test";
import { resolveTopHeaderTitle } from "./page-title-logic.ts";

const label = (key: string) => key;

test("admin and workdrive titles follow the current path", () => {
  const base = { scopeFolderName: "Admin", adminMode: true, locale: "en" as const, label };
  assert.equal(resolveTopHeaderTitle({ ...base, pathname: "/admin/dlp" }), "Data Loss Prevention");
  assert.equal(resolveTopHeaderTitle({ ...base, pathname: "/admin/data-administration" }), "Data Administration");
  assert.equal(resolveTopHeaderTitle({ ...base, pathname: "/admin" }), "Dashboard");
  assert.equal(resolveTopHeaderTitle({ ...base, adminMode: false, pathname: "/files/collections" }), "Collect Files");
  assert.equal(resolveTopHeaderTitle({ ...base, adminMode: false, pathname: "/files/templates" }), "Templates");
  assert.equal(resolveTopHeaderTitle({ ...base, adminMode: false, pathname: "/files" }), "My Files");
  assert.equal(
    resolveTopHeaderTitle({ ...base, adminMode: false, pathname: "/files/11111111-1111-4111-8111-111111111111", scopeFolderName: "Design" }),
    "Design",
  );
});