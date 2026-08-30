import test from "node:test";
import assert from "node:assert/strict";
import {
  activeSidebarSection,
  debounce,
  isViewMode,
  ORG_SYNC_CHANNEL,
  parseOrgSwitchMessage,
  persistViewMode,
  readStoredViewMode,
  sanitizeViewMode,
  VIEW_MODE_STORAGE_KEY,
} from "./view-mode-logic.ts";

test("sanitizeViewMode falls back to list for unknown values", () => {
  assert.equal(sanitizeViewMode("grid"), "grid");
  assert.equal(sanitizeViewMode("cards"), "list");
  assert.equal(sanitizeViewMode(null), "list");
  assert.equal(isViewMode("grid"), true);
  assert.equal(isViewMode("carousel"), false);
});

test("view mode persists to storage and reads back", () => {
  const store = new Map<string, string>();
  const fakeStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  } as unknown as Storage;
  persistViewMode(fakeStorage, "grid");
  assert.equal(store.get(VIEW_MODE_STORAGE_KEY), "grid");
  assert.equal(readStoredViewMode(fakeStorage), "grid");
  assert.equal(readStoredViewMode(null), "list");
});

test("activeSidebarSection maps workspace paths to the four primary sections", () => {
  assert.equal(activeSidebarSection("/files"), "myFolder");
  assert.equal(activeSidebarSection("/files/folder/abc"), "myFolder");
  assert.equal(activeSidebarSection("/files/recent"), "myFolder");
  assert.equal(activeSidebarSection("/files/team-folders"), "teamFolders");
  assert.equal(activeSidebarSection("/files/team-folders/abc"), "teamFolders");
  assert.equal(activeSidebarSection("/files/shared-with-me"), "sharedWithMe");
  assert.equal(activeSidebarSection("/files/trash"), "trash");
  assert.equal(activeSidebarSection("/other"), "myFolder");
});

test("debounce collapses bursts and supports cancellation", async () => {
  let calls = 0;
  const run = debounce(() => void ++calls, 10);
  run();
  run();
  run();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(calls, 1);
  const cancelled = debounce(() => void ++calls, 5);
  cancelled();
  cancelled.cancel();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls, 1);
});

test("parseOrgSwitchMessage validates the cross-tab switch payload", () => {
  assert.deepEqual(parseOrgSwitchMessage({ type: "org-switched", organizationId: "org-1" }), {
    type: "org-switched",
    organizationId: "org-1",
  });
  assert.equal(parseOrgSwitchMessage({ type: "other", organizationId: "org-1" }), null);
  assert.equal(parseOrgSwitchMessage({ type: "org-switched" }), null);
  assert.equal(parseOrgSwitchMessage("noise"), null);
  assert.equal(ORG_SYNC_CHANNEL.length > 0, true);
});
