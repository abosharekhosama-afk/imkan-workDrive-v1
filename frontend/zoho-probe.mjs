/* Live Zoho WorkDrive inspection probe (public/unauthenticated surface only). */
import { chromium } from "playwright";
import fs from "node:fs";

const OUT = "zoho-probe-results.json";
const results = { navigations: [], notes: [] };

const browser = await chromium.launch({ executablePath: "C:\\Users\\pc\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe" });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

async function probe(url, name) {
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1500);
    const finalUrl = page.url();
    const title = await page.title();
    results.navigations.push({ name, requested: url, status: resp?.status(), finalUrl, title });
    // collect computed styles of header-ish elements if present
    const styles = await page.evaluate(() => {
      const pick = (el) => {
        if (!el) return null;
        const c = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return { tag: el.tagName, cls: (el.className || "").toString().slice(0, 120), bg: c.backgroundColor, color: c.color, borderColor: c.borderColor, h: r.height, pad: c.padding, font: c.fontSize };
      };
      return {
        header: pick(document.querySelector("header")),
        topbar: pick(document.querySelector("[class*='topbar' i],[class*='header' i]")),
        bodyBg: getComputedStyle(document.body).backgroundColor,
        primaryButtons: [...document.querySelectorAll("button")].slice(0, 8).map(pick),
      };
    });
    results.navigations[results.navigations.length - 1].styles = styles;
  } catch (e) {
    results.navigations.push({ name, requested: url, error: String(e).slice(0, 200) });
  }
}

await probe("https://workdrive.zoho.com/", "marketing-home");
// attempt app route — expect redirect to accounts.zoho.com sign-in
await probe("https://workdrive.zoho.com/files", "app-files-route");

fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2).slice(0, 4000));
try { await page.screenshot({ path: "zoho-probe-final.png", fullPage: false, timeout: 8000 }); } catch { /* optional */ }
await browser.close();
