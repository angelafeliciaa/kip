import { BrowserContext } from "playwright";
import { Provider, ProviderOpts, ProvisionResult } from "../types.js";
import { registry } from "./registry.js";
import { waitForUser } from "../utils/notify.js";

const openrouterProvider: Provider = {
  name: "openrouter",
  requiredCredentials: ["OPENROUTER_API_KEY"],

  detect(env: Record<string, string>): boolean {
    return !!env["OPENROUTER_API_KEY"];
  },

  async validate(env: Record<string, string>): Promise<boolean> {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${env["OPENROUTER_API_KEY"]}` },
      });
      return res.status === 200;
    } catch {
      return false;
    }
  },

  async provision(
    context: BrowserContext,
    _opts: ProviderOpts
  ): Promise<ProvisionResult> {
    const page = await context.newPage();

    // Step 1: Navigate to the keys page
    await page.goto("https://openrouter.ai/settings/keys");

    // Step 2: Check auth state — if redirected away from keys page, prompt user to log in
    let onKeysPage = page.url().includes("/settings/keys");
    while (!onKeysPage) {
      await waitForUser(
        "Please log in to OpenRouter in the browser, then press Enter"
      );
      onKeysPage = page.url().includes("/settings/keys");
      if (!onKeysPage) {
        await page.goto("https://openrouter.ai/settings/keys");
        await page.waitForLoadState("networkidle");
        onKeysPage = page.url().includes("/settings/keys");
      }
    }

    // Step 3: Create a new key
    // Selector may be fragile — OpenRouter may change button text/placement
    const createButton = await page.waitForSelector(
      'button:has-text("Create Key"), button:has-text("Create"), button:has-text("New Key")',
      { timeout: 10_000 }
    ).catch(() => null);

    if (!createButton) {
      throw new Error(
        'Could not find "Create Key" button on OpenRouter keys page. ' +
          "The UI may have changed — check selectors."
      );
    }

    await createButton.click();

    // Step 3b: Fill in the name field in the modal/form
    const timestamp = Date.now();
    const keyName = `autoprovision-${timestamp}`;

    // Selector may be fragile — looks for a visible text input in the modal
    const nameInput = await page.waitForSelector(
      'input[name="name"], input[placeholder*="name" i], input[placeholder*="key" i], dialog input[type="text"], [role="dialog"] input[type="text"]',
      { timeout: 5_000 }
    ).catch(() => null);

    if (nameInput) {
      await nameInput.fill(keyName);
    }

    // Submit the form — look for a submit/create button inside the modal
    // Selector may be fragile
    const submitButton = await page.waitForSelector(
      'dialog button[type="submit"], [role="dialog"] button[type="submit"], [role="dialog"] button:has-text("Create"), dialog button:has-text("Create"), form button[type="submit"]',
      { timeout: 5_000 }
    ).catch(() => null);

    if (submitButton) {
      await submitButton.click();
    } else {
      // Fallback: press Enter to submit
      await page.keyboard.press("Enter");
    }

    // Step 4: Extract the key (starts with sk-or-)
    // The key is typically shown once after creation in a modal or toast
    // Selector may be fragile
    const keyElement = await page.waitForSelector(
      'text=/sk-or-[\\w-]+/, code:has-text("sk-or-"), input[value^="sk-or-"], [data-testid="api-key"], pre:has-text("sk-or-")',
      { timeout: 10_000 }
    ).catch(() => null);

    let apiKey: string | null = null;

    if (keyElement) {
      const tagName = await keyElement.evaluate((el) =>
        el.tagName.toLowerCase()
      );
      if (tagName === "input") {
        apiKey = await keyElement.inputValue();
      } else {
        const text = await keyElement.textContent();
        const match = text?.match(/sk-or-[\w-]+/);
        apiKey = match ? match[0] : null;
      }
    }

    // Fallback: scan the page for the key pattern
    if (!apiKey) {
      const pageContent = await page.content();
      const match = pageContent.match(/sk-or-[\w-]+/);
      apiKey = match ? match[0] : null;
    }

    if (!apiKey) {
      throw new Error(
        "Could not extract API key. The key may not have been displayed, or the UI has changed."
      );
    }

    await page.close();

    return {
      vars: { OPENROUTER_API_KEY: apiKey },
    };
  },
};

registry.register(openrouterProvider);
