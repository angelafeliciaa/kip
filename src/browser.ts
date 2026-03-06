import { chromium, BrowserContext } from "playwright";
import fs from "fs";
import path from "path";
import os from "os";

const BROWSER_DATA_DIR = path.join(os.homedir(), ".autoprovision", "browser-data");

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export interface LaunchBrowserOpts {
  headless?: boolean;
}

export async function launchBrowser(
  opts?: LaunchBrowserOpts
): Promise<BrowserContext> {
  fs.mkdirSync(BROWSER_DATA_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(BROWSER_DATA_DIR, {
    headless: opts?.headless ?? false,
    viewport: { width: 1280, height: 800 },
    userAgent: DEFAULT_USER_AGENT,
  });

  return context;
}

export async function closeBrowser(context: BrowserContext): Promise<void> {
  await context.close();
}
