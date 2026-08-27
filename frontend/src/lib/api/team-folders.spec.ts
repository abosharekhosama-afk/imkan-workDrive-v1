import test from "node:test";
import assert from "node:assert/strict";
import {
  addTeamFolderMember,
  createTeamFolder,
  deleteTeamFolder,
  getTeamFolder,
  listTeamFolderMembers,
  listTeamFolders,
  removeTeamFolderMember,
  renameTeamFolder,
  updateTeamFolderMember,
} from "./team-folders.ts";

const TEAM_FOLDER_ID = "00000000-0000-4000-8000-000000000041";
const USER_ID = "00000000-0000-4000-8000-000000000042";

test("Team Folder client follows the contract and never sends client tenant context", async () => {
  process.env.NEXT_PUBLIC_DEV_JWT = "jwt-tenant-a";
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://api.test";

  const requests: Array<{ path: string; method: string; body?: unknown; authorization: string | null }> = [];
  globalThis.fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    requests.push({
      path: new URL(String(input)).pathname,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      authorization: headers.get("Authorization"),
    });
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  await createTeamFolder("Legal");
  await listTeamFolders();
  await getTeamFolder(TEAM_FOLDER_ID);
  await renameTeamFolder(TEAM_FOLDER_ID, "Legal 2026");
  await deleteTeamFolder(TEAM_FOLDER_ID);
  await listTeamFolderMembers(TEAM_FOLDER_ID);
  await addTeamFolderMember(TEAM_FOLDER_ID, USER_ID, "EDITOR");
  await updateTeamFolderMember(TEAM_FOLDER_ID, USER_ID, "VIEWER");
  await removeTeamFolderMember(TEAM_FOLDER_ID, USER_ID);

  assert.deepEqual(
    requests.map(({ path, method, body }) => ({ path, method, body })),
    [
      { path: "/team-folders", method: "POST", body: { name: "Legal" } },
      { path: "/team-folders", method: "GET", body: undefined },
      { path: `/team-folders/${TEAM_FOLDER_ID}`, method: "GET", body: undefined },
      { path: `/team-folders/${TEAM_FOLDER_ID}`, method: "PATCH", body: { name: "Legal 2026" } },
      { path: `/team-folders/${TEAM_FOLDER_ID}`, method: "DELETE", body: undefined },
      { path: `/team-folders/${TEAM_FOLDER_ID}/members`, method: "GET", body: undefined },
      {
        path: `/team-folders/${TEAM_FOLDER_ID}/members`,
        method: "POST",
        body: { userId: USER_ID, role: "EDITOR" },
      },
      {
        path: `/team-folders/${TEAM_FOLDER_ID}/members/${USER_ID}`,
        method: "PATCH",
        body: { role: "VIEWER" },
      },
      {
        path: `/team-folders/${TEAM_FOLDER_ID}/members/${USER_ID}`,
        method: "DELETE",
        body: undefined,
      },
    ],
  );

  for (const request of requests) {
    assert.equal(request.authorization, "Bearer jwt-tenant-a");
    assert.equal(request.path.includes("orgId"), false);
    assert.equal(request.path.includes("org_id"), false);
    assert.equal(JSON.stringify(request.body ?? {}).includes("orgId"), false);
    assert.equal(JSON.stringify(request.body ?? {}).includes("org_id"), false);
  }
});
