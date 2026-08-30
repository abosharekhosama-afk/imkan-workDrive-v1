import { execSync } from "node:child_process";
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  adminAccessToken,
  API_BASE,
  foreignTenantAccessToken,
  SEED_ORG_ID,
  setAccessToken,
} from "./helpers/auth";

const runTag = `e2e-browser-${Date.now()}`;
const folderName = `${runTag}-folder`;
let folderId = "";
let renamedFile = `${runTag}-renamed.txt`;

test.describe.configure({ mode: "serial" });

test.describe("WorkDrive browser E2E (frontend → API → MySQL → local storage)", () => {
  test("requires authentication before showing workspace data", async ({ page }) => {
    await page.goto("/files");
    await expect(page.getByText("Sign-in token is missing.")).toBeVisible();
  });

  test("loads the files workspace when authenticated", async ({ page }) => {
    await setAccessToken(page, adminAccessToken());
    await page.goto("/files");
    await expect(page.getByRole("heading", { name: "Files" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Files" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Trash" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Activity" })).toBeVisible();
  });

  test("creates a folder and navigates into it", async ({ page }) => {
    await setAccessToken(page, adminAccessToken());
    await page.goto("/files");
    await page.getByLabel("Folder name").fill(folderName);
    await page.getByRole("button", { name: "New folder" }).click();
    await expect(page.getByRole("link", { name: folderName })).toBeVisible();
    await page.getByRole("link", { name: folderName }).click();
    await expect(page).toHaveURL(/\/files\/[0-9a-f-]{36}$/);
    folderId = page.url().split("/files/")[1] ?? "";
    expect(folderId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("uploads a file and verifies it in the folder listing", async ({ page }) => {
    await setAccessToken(page, adminAccessToken());
    await page.goto(`/files/${folderId}`);
    const tempFile = path.join(os.tmpdir(), `${runTag}.txt`);
    fs.writeFileSync(tempFile, `${runTag}-upload-bytes`);
    await page.locator('input[type="file"]').setInputFiles(tempFile);
    await expect(page.getByRole("cell", { name: `${runTag}.txt` })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("renames the uploaded file", async ({ page }) => {
    await setAccessToken(page, adminAccessToken());
    await page.goto(`/files/${folderId}`);
    const row = page.getByRole("row").filter({ hasText: `${runTag}.txt` });
    // Open the actions dropdown
    await row.getByRole("button", { name: "Actions" }).click();
    // Wait for dropdown to open and click Rename
    await page.getByRole("menuitem", { name: "Rename" }).click();
    // Wait for modal to appear with Rename heading
    await expect(page.getByRole("heading", { name: "Rename" })).toBeVisible({ timeout: 10000 });
    const renameForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Rename" }) });
    // Use the input directly since it's wrapped in a label
    await renameForm.locator('input').fill(renamedFile);
    await renameForm.getByRole("button", { name: "Rename" }).click();
    await expect(page.getByRole("cell", { name: renamedFile })).toBeVisible();
  });

  test("creates a share link for the file", async ({ page }) => {
    await setAccessToken(page, adminAccessToken());
    await page.goto(`/files/${folderId}`);
    const row = page.getByRole("row").filter({ hasText: renamedFile });
    await row.getByRole("button", { name: "Share" }).click();
    await expect(page.getByRole("heading", { name: "Share link" })).toBeVisible();
    await page.getByRole("button", { name: "Create link" }).click();
    await expect(page.getByText("Link created:")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
  });

  test("downloads file bytes through the local storage endpoint", async ({ page }) => {
    await setAccessToken(page, adminAccessToken());
    await page.goto(`/files/${folderId}`);
    const row = page.getByRole("row").filter({ hasText: renamedFile });
    await Promise.all([
      page.waitForURL(/\/storage\/objects\?token=/),
      row.getByRole("button", { name: "Download" }).click(),
    ]);
    await expect(page.locator("body")).toContainText(`${runTag}-upload-bytes`);
  });

  test("moves the file to trash and restores it", async ({ page }) => {
    await setAccessToken(page, adminAccessToken());
    await page.goto(`/files/${folderId}`);
    const row = page.getByRole("row").filter({ hasText: renamedFile });
    await row.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete" }).last().click();
    await expect(page.getByRole("cell", { name: renamedFile })).toHaveCount(0);
    await page.getByRole("link", { name: "Trash" }).click();
    await expect(page.getByRole("heading", { name: "Trash" })).toBeVisible();
    await expect(page.getByText(renamedFile)).toBeVisible();
    await page.getByRole("listitem").filter({ hasText: renamedFile }).getByRole("button", { name: "Restore" }).click();
    await expect(page.getByText(renamedFile)).toHaveCount(0);
    await page.getByRole("link", { name: "Files" }).click();
    await page.getByRole("link", { name: folderName }).click();
    await expect(page.getByRole("cell", { name: renamedFile })).toBeVisible();
  });

  test("shows activity for the WorkDrive actions", async ({ page }) => {
    await setAccessToken(page, adminAccessToken());
    await page.goto("/files/activity");
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
    const activityTable = page.getByRole("table");
    await expect(activityTable.getByRole("columnheader", { name: "Action" })).toBeVisible();
    await expect(activityTable.getByRole("cell", { name: "FILE_UPLOAD_COMPLETE" })).not.toHaveCount(0);
    await expect(activityTable.getByRole("cell", { name: "SHARE_CREATED" })).not.toHaveCount(0);
    await expect(activityTable.getByRole("cell", { name: "FILE_DOWNLOAD" })).not.toHaveCount(0);
    await expect(activityTable.getByRole("cell", { name: "FILE_TRASHED" })).not.toHaveCount(0);
    await expect(activityTable.getByRole("cell", { name: "FILE_RESTORED" })).not.toHaveCount(0);
  });

  test("does not expose Tenant A folder to a foreign tenant JWT", async ({ page, request }) => {
    await setAccessToken(page, foreignTenantAccessToken());
    const response = await request.get(`${API_BASE}/folders/${folderId}`, {
      headers: { Authorization: `Bearer ${foreignTenantAccessToken()}` },
    });
    expect(response.status()).toBe(404);
    await page.goto("/files");
    await expect(page.getByRole("link", { name: folderName })).not.toBeVisible();
  });

  test.afterAll(async ({ request }) => {
    const token = adminAccessToken();
    const headers = { Authorization: `Bearer ${token}` };
    if (folderId) {
      const detail = await request.get(`${API_BASE}/folders/${folderId}`, { headers });
      if (detail.ok()) {
        const body = (await detail.json()) as { files?: Array<{ id: string }> };
        for (const file of body.files ?? []) {
          await request.delete(`${API_BASE}/files/${file.id}`, { headers });
        }
      }
      execSync(`node --env-file=.env scripts/e2e-browser-cleanup.mjs ${folderId}`, {
        cwd: path.join(process.cwd(), "../backend"),
        stdio: "inherit",
      });
    }
  });
});
