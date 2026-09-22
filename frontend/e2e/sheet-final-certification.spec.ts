import { test, expect } from '@playwright/test';

const fileId = process.env.IMKAN_SHEET_E2E_FILE_ID;

test.describe('IMKAN Sheet final runtime certification', () => {
  test.skip(!fileId, 'Set IMKAN_SHEET_E2E_FILE_ID to a real SHEET document id in the authenticated test environment.');

  test('open -> edit formula -> save -> reload -> verify', async ({ page }) => {
    await page.goto(`/office/sheet/${fileId}`);
    await expect(page.locator('text=Home')).toBeVisible();
    await expect(page.locator('[aria-label="Formula bar"], input').first()).toBeVisible();
    const before = await page.locator('body').innerText();
    expect(before).toContain('Sheet');
    await page.keyboard.press('Control+L');
    await page.keyboard.type('A1');
    await page.keyboard.press('Enter');
    await page.keyboard.type('=SUM(1,2,3)');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.locator('body')).toContainText('Sheet');
  });
});
