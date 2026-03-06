import { chromium } from "playwright";
import fs from "fs";
import os from "os";
import path from "path";

const BROWSER_DATA_DIR = path.join(os.homedir(), ".autoprovision", "browser-data");
fs.mkdirSync(BROWSER_DATA_DIR, { recursive: true });

(async () => {
  const context = await chromium.launchPersistentContext(BROWSER_DATA_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();
  await page.goto("https://openrouter.ai/settings/keys");
  await page.waitForLoadState("networkidle");

  console.log("Current URL:", page.url());

  // Screenshot the page
  await page.screenshot({ path: "/tmp/openrouter-debug.png", fullPage: true });
  console.log("Screenshot saved to /tmp/openrouter-debug.png");

  // Dump all visible buttons and links
  const elements = await page.evaluate(() => {
    const results: string[] = [];
    document.querySelectorAll("button, a, input").forEach((el) => {
      const tag = el.tagName.toLowerCase();
      const text = (el as HTMLElement).innerText?.trim().slice(0, 80);
      const type = el.getAttribute("type") || "";
      const href = el.getAttribute("href") || "";
      const visible = (el as HTMLElement).offsetParent !== null;
      const placeholder = el.getAttribute("placeholder") || "";
      results.push(`${tag} | type=${type} | text="${text}" | href="${href}" | placeholder="${placeholder}" | visible=${visible}`);
    });
    return results;
  });

  console.log("\n--- Page elements ---");
  elements.forEach((e) => console.log(e));

  // Wait a bit so user can see
  await page.waitForTimeout(5000);
  await context.close();
})();
