import test from "node:test";
import assert from "node:assert/strict";
import { isWorkspaceHref, WORKSPACE_HREFS, workspaceNavItems } from "./workspace-routes.ts";

test("workspace nav covers files, Team Folders, trash, and activity without orgId", () => {
  const hrefs = workspaceNavItems().map((item) => item.href);
  assert.deepEqual(hrefs, [
    "/files",
    "/files/recent",
    "/files/team-folders",
    "/files/shared-with-me",
    "/files/shared-by-me",
    "/files/favorites",
    "/files/trash",
    "/files/activity",
  ]);
  assert.equal(WORKSPACE_HREFS.teamFolders, "/files/team-folders");
  for (const href of Object.values(WORKSPACE_HREFS)) {
    assert.equal(href.includes("orgId"), false);
  }
});

test("folder routes stay on the files workspace item", () => {
  assert.equal(isWorkspaceHref("/files/00000000-0000-4000-8000-000000000041", "/files"), true);
  assert.equal(isWorkspaceHref("/files/trash", "/files"), false);
  assert.equal(isWorkspaceHref("/files/activity", WORKSPACE_HREFS.activity), true);
});

test("Team Folder routes stay in their own workspace item", () => {
  assert.equal(isWorkspaceHref("/files/team-folders", WORKSPACE_HREFS.teamFolders), true);
  assert.equal(
    isWorkspaceHref("/files/team-folders/00000000-0000-4000-8000-000000000041", WORKSPACE_HREFS.teamFolders),
    true,
  );
  assert.equal(isWorkspaceHref("/files/team-folders", WORKSPACE_HREFS.files), false);
});
