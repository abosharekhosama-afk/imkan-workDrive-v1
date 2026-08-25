export default async function run(page) {
  const TOKEN = process.env.WD_TOKEN;
  await page.goto("http://localhost:3000/files");
  await page.evaluate(
    ([token]) => {
      localStorage.setItem("workdrive_access_token", token);
      localStorage.setItem(
        "workdrive_user",
        JSON.stringify({ role: "ADMIN", name: "Admin", email: "admin@example.imkan" }),
      );
    },
    [TOKEN],
  );

  const results = {};

  await page.goto("http://localhost:3000/files/recent");
  await page.waitForTimeout(2500);
  results.recentRows = await page.evaluate(() => document.querySelectorAll(".wd-table tbody tr").length);
  results.recentHead = await page.evaluate(() => document.querySelector(".wd-page-head h1")?.innerText ?? null);

  await page.goto("http://localhost:3000/organization");
  await page.waitForTimeout(2000);
  results.orgCards = await page.evaluate(() => document.querySelectorAll(".wd-card").length);
  results.orgTitle = await page.evaluate(() => document.querySelector(".wd-page-head h1")?.innerText ?? null);

  await page.screenshot({ path: "org-page.png", fullPage: true });

  await page.goto("http://localhost:3000/files/trash");
  await page.waitForTimeout(1500);
  results.trashEmpty = await page.evaluate(() => Boolean(document.querySelector(".wd-empty")));
  results.trashHead = await page.evaluate(() => document.querySelector(".wd-page-head h1")?.innerText ?? null);

  await page.goto("http://localhost:3000/files/shared-with-me");
  await page.waitForTimeout(1200);
  results.sharedTable = await page.evaluate(() => Boolean(document.querySelector(".wd-table")));

  return results;
}
