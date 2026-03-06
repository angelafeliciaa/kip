import { execSync } from "child_process";
import { BrowserContext } from "playwright";
import { Provider, ProviderOpts, ProvisionResult } from "../types.js";
import { registry } from "./registry.js";
import { waitForUser } from "../utils/notify.js";

function getEmail(): string {
  // Pull email from git config, or from autoprovision config
  try {
    return execSync("git config --global user.email", {
      encoding: "utf-8",
    }).trim();
  } catch {
    return "";
  }
}

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
    const email = getEmail();

    // Step 1: Navigate to OpenRouter
    await page.goto("https://openrouter.ai/settings/keys");
    await page.waitForLoadState("networkidle");

    // Step 2: Handle auth — check if we landed on keys page or got redirected
    if (!page.url().includes("/settings/keys")) {
      console.log("[openrouter] Not logged in — starting auth flow...");

      // Navigate to login page
      await page.goto("https://openrouter.ai/auth/login");
      await page.waitForLoadState("networkidle");

      // Pre-fill email if we have it
      if (email) {
        console.log(`[openrouter] Pre-filling email: ${email}`);
        const emailInput = await page
          .waitForSelector(
            'input[type="email"], input[name="email"], input[placeholder*="email" i]',
            { timeout: 5000 }
          )
          .catch(() => null);

        if (emailInput) {
          await emailInput.fill(email);
          // Try to submit the email form
          const submitBtn = await page
            .$(
              'button[type="submit"], button:has-text("Continue"), button:has-text("Sign in"), button:has-text("Log in")'
            )
            .catch(() => null);
          if (submitBtn) {
            await submitBtn.click();
            await page.waitForLoadState("networkidle");
          }
        }
      }

      // Check if we need Google OAuth or magic link
      const googleBtn = await page
        .$(
          'button:has-text("Google"), a:has-text("Google"), [data-provider="google"]'
        )
        .catch(() => null);

      if (googleBtn && !email) {
        console.log("[openrouter] Google OAuth available — clicking...");
        await googleBtn.click();
        await page.waitForLoadState("networkidle");
      }

      // At this point, user may need to:
      // - Complete OAuth in the browser
      // - Click a magic link in their email
      // - Enter a verification code
      // Wait for them to end up on the keys page
      await waitForUser(
        "Complete the login in the browser (check email for magic link if needed), then press Enter"
      );

      // Navigate back to keys page after auth
      await page.goto("https://openrouter.ai/settings/keys");
      await page.waitForLoadState("networkidle");

      // Verify we're authenticated now
      if (!page.url().includes("/settings/keys")) {
        throw new Error(
          "Still not authenticated after login attempt. Check the browser."
        );
      }
    }

    console.log("[openrouter] On keys page — creating new key...");

    // Step 3: Create a new key
    // Look for create button — selector may be fragile
    const createButton = await page
      .waitForSelector(
        'button:has-text("Create Key"), button:has-text("Create"), button:has-text("New Key"), button:has-text("Generate")',
        { timeout: 10_000 }
      )
      .catch(() => null);

    if (!createButton) {
      throw new Error(
        'Could not find "Create Key" button. The OpenRouter UI may have changed.'
      );
    }

    await createButton.click();

    // Fill in key name
    const timestamp = Date.now();
    const keyName = `autoprovision-${timestamp}`;

    const nameInput = await page
      .waitForSelector(
        'input[name="name"], input[placeholder*="name" i], input[placeholder*="key" i], dialog input[type="text"], [role="dialog"] input[type="text"]',
        { timeout: 5_000 }
      )
      .catch(() => null);

    if (nameInput) {
      await nameInput.fill(keyName);
    }

    // Submit
    const submitButton = await page
      .waitForSelector(
        'dialog button[type="submit"], [role="dialog"] button[type="submit"], [role="dialog"] button:has-text("Create"), dialog button:has-text("Create"), form button[type="submit"]',
        { timeout: 5_000 }
      )
      .catch(() => null);

    if (submitButton) {
      await submitButton.click();
    } else {
      await page.keyboard.press("Enter");
    }

    // Step 4: Extract the key (starts with sk-or-)
    await page.waitForTimeout(2000);

    let apiKey: string | null = null;

    // Try to find it in a visible element
    const keyElement = await page
      .waitForSelector(
        'text=/sk-or-[\\w-]+/, code:has-text("sk-or-"), input[value^="sk-or-"], [data-testid="api-key"], pre:has-text("sk-or-")',
        { timeout: 10_000 }
      )
      .catch(() => null);

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

    // Fallback: scan the full page HTML
    if (!apiKey) {
      const pageContent = await page.content();
      const match = pageContent.match(/sk-or-[\w-]+/);
      apiKey = match ? match[0] : null;
    }

    if (!apiKey) {
      throw new Error(
        "Could not extract API key from the page. The UI may have changed."
      );
    }

    await page.close();

    return {
      vars: { OPENROUTER_API_KEY: apiKey },
    };
  },
};

registry.register(openrouterProvider);
