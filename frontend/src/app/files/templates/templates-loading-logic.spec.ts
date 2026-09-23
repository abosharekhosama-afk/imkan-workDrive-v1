import test from "node:test";
import assert from "node:assert/strict";
import { filterTemplateRecords, shouldHydrateLibraryOnce, templatesCacheKey } from "./templates-loading-logic.ts";

const sample = [
  { id: "1", name: "Alpha Doc", description: "One", type: "DOCUMENT" as const, library: "PUBLIC" as const, category: { id: "c1", name: "General" }, owner: null, version: 1, size: 1, mimeType: null, extension: "docx", updatedAt: "2026-01-02T00:00:00.000Z", canManage: false, permissions: { canUse: true, canDuplicate: true, canEdit: false, canCreateVersion: false, canDelete: false, canManage: false, canViewVersions: true } },
  { id: "2", name: "Beta Sheet", description: "Two", type: "SPREADSHEET" as const, library: "PUBLIC" as const, category: { id: "c2", name: "Finance" }, owner: null, version: 1, size: 1, mimeType: null, extension: "xlsx", updatedAt: "2026-01-03T00:00:00.000Z", canManage: false, permissions: { canUse: true, canDuplicate: true, canEdit: false, canCreateVersion: false, canDelete: false, canManage: false, canViewVersions: true } },
];

test("filters and sorts public templates client-side", () => {
  assert.deepEqual(filterTemplateRecords(sample, { type: "SPREADSHEET" }).map((x) => x.id), ["2"]);
  assert.deepEqual(filterTemplateRecords(sample, { q: "alpha" }).map((x) => x.id), ["1"]);
  assert.deepEqual(filterTemplateRecords(sample, { sort: "name" }).map((x) => x.id), ["1", "2"]);
});

test("marks PUBLIC as hydrate-once library", () => {
  assert.equal(shouldHydrateLibraryOnce("PUBLIC"), true);
  assert.equal(shouldHydrateLibraryOnce("PERSONAL"), false);
});

test("builds stable cache keys", () => {
  assert.match(templatesCacheKey({ library: "PUBLIC", q: "  hello " }), /hello/);
});
