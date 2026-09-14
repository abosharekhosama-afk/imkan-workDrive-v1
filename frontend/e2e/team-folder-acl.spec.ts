import { test, expect } from "@playwright/test";
import {
  adminAccessToken,
  API_BASE,
  memberAccessToken,
  setAccessToken,
} from "./helpers/auth";

const runTag = `tf-e2e-${Date.now()}`;
const teamFolderName = `${runTag}-legal`;

test.describe.configure({ mode: "serial" });

test.describe("Team Folder browser E2E (authorized open vs same-org non-member)", () => {
  let teamFolderId = "";
  let rootFolderId = "";

  test.afterAll(async ({ request }) => {
    if (!teamFolderId) {
      return;
    }
    await request.delete(`${API_BASE}/team-folders/${teamFolderId}`, {
      headers: { Authorization: `Bearer ${adminAccessToken()}` },
    });
  });

  test("lets an org admin open a Team Folder root and hides it from a same-org non-member", async ({
    page,
    browser,
    request,
  }) => {
    const created = await request.post(`${API_BASE}/team-folders`, {
      headers: { Authorization: `Bearer ${adminAccessToken()}` },
      data: { name: teamFolderName },
    });
    expect(created.status()).toBe(201);
    const body = (await created.json()) as { id: string; rootFolderId: string; name: string };
    teamFolderId = body.id;
    rootFolderId = body.rootFolderId;
    expect(teamFolderId).toMatch(/^[0-9a-f-]{36}$/);
    expect(rootFolderId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.name).toBe(teamFolderName);

    await setAccessToken(page, adminAccessToken());
    await page.goto("/files");
    const teamFolderLink = page.getByRole("link", { name: teamFolderName });
    await expect(teamFolderLink).toBeVisible();
    await teamFolderLink.click();
    await expect(page).toHaveURL(new RegExp(`/files/${rootFolderId}$`));
    await expect(page.getByText(teamFolderName)).toBeVisible();

    const memberHeaders = { Authorization: `Bearer ${memberAccessToken()}` };
    const hiddenTeamFolder = await request.get(`${API_BASE}/team-folders/${teamFolderId}`, {
      headers: memberHeaders,
    });
    expect(hiddenTeamFolder.status()).toBe(404);
    const hiddenRoot = await request.get(`${API_BASE}/folders/${rootFolderId}`, {
      headers: memberHeaders,
    });
    expect(hiddenRoot.status()).toBe(404);

    const memberPage = await browser.newPage();
    await setAccessToken(memberPage, memberAccessToken());
    await memberPage.goto("/files");
    await expect(memberPage.getByRole("heading", { name: "Files" })).toBeVisible();
    await expect(memberPage.getByRole("link", { name: teamFolderName })).toHaveCount(0);

    await memberPage.goto(`/files/${rootFolderId}`);
    await expect(memberPage.getByText("The request could not be completed.")).toBeVisible();
    await expect(memberPage.getByRole("link", { name: teamFolderName })).toHaveCount(0);
    await memberPage.close();
  });
});
