import { test, expect } from '@playwright/test';
import { adminAccessToken, setAccessToken } from './helpers/auth';

const fileId = process.env.IMKAN_WRITER_E2E_FILE_ID;

test.describe('IMKAN Writer final runtime certification', () => {
  test.skip(!fileId, 'Set IMKAN_WRITER_E2E_FILE_ID to a real WRITER document id in the authenticated test environment.');

  test('opens -> edits -> formats -> undoes -> redoes -> saves', async ({ page }) => {
    await setAccessToken(page, adminAccessToken());
    await page.goto(`/office/writer/${fileId}`);

    await expect(page.getByRole('button', { name: 'Bold' })).toBeVisible();
    const editor = page.locator('[data-writer-editor]').first();
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('IMKAN Writer E2E');
    await page.keyboard.press('Control+A');
    await page.getByRole('button', { name: 'Bold' }).click();
    await expect(page.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(editor).toContainText('IMKAN Writer E2E');
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(page.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');

    await expect(page.getByTestId('writer-save-status')).toContainText(/Saved|محفوظ|Saving|جارٍ الحفظ|Syncing|جارٍ المزامنة/);
    await page.waitForTimeout(1000);
    await page.reload();
    await expect(page.locator('[data-writer-editor]').first()).toContainText('IMKAN Writer E2E');
  });

  test('keeps Writer usable at narrow viewport with real overflow control', async ({ page }) => {
    await setAccessToken(page, adminAccessToken());
    await page.setViewportSize({ width: 700, height: 900 });
    await page.goto(`/office/writer/${fileId}`);
    await expect(page.getByRole('button', { name: 'More tools' })).toBeVisible();
    await page.getByRole('button', { name: 'More tools' }).click();
    await expect(page.getByText('Insert table')).toBeVisible();
  });

  test('supports RTL document chrome without breaking the editor', async ({ page }) => {
    await setAccessToken(page, adminAccessToken());
    await page.goto(`/office/writer/${fileId}?lang=ar`);
    await expect(page.locator('[data-office-direction="rtl"]')).toBeVisible();
    await expect(page.locator('[data-writer-editor]').first()).toBeVisible();
  });
});
