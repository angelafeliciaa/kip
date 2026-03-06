import crypto from "crypto";
import { BrowserContext } from "playwright";
import { Provider, ProviderOpts, ProvisionResult } from "../types.js";
import { registry } from "./registry.js";
import { waitForUser } from "../utils/notify.js";

let createdProjectRef: string | null = null;

const supabaseProvider: Provider = {
  name: "supabase",
  requiredCredentials: [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "DATABASE_URL",
  ],

  detect(env: Record<string, string>): boolean {
    return (
      !!env["SUPABASE_URL"] &&
      !!env["SUPABASE_ANON_KEY"] &&
      !!env["SUPABASE_SERVICE_ROLE_KEY"] &&
      !!env["DATABASE_URL"]
    );
  },

  async provision(
    context: BrowserContext,
    opts: ProviderOpts
  ): Promise<ProvisionResult> {
    const page = await context.newPage();
    const projectName = opts.projectName || "autoprovision";

    // Step 1: Navigate to Supabase dashboard projects
    await page.goto("https://supabase.com/dashboard/projects");
    await page.waitForLoadState("networkidle");

    // Step 2: Check auth — if redirected to login, prompt user
    if (!page.url().includes("/dashboard")) {
      await waitForUser(
        "Please log in to Supabase in the browser, then press Enter"
      );
      await page.goto("https://supabase.com/dashboard/projects");
      await page.waitForLoadState("networkidle");
    }

    // Step 3: Check for existing project matching projectName
    let projectRef: string | null = null;

    // Supabase dashboard is a React SPA — wait for project cards to render
    await page
      .waitForSelector('a[href*="/dashboard/project/"]', { timeout: 15_000 })
      .catch(() => null);

    const projectLink = await page
      .$(
        `a[href*="/dashboard/project/"]:has-text("${projectName}")`
      )
      .catch(() => null);

    if (projectLink) {
      // Existing project found — click into it
      const href = await projectLink.getAttribute("href");
      const match = href?.match(/\/dashboard\/project\/([^/]+)/);
      projectRef = match ? match[1] : null;
      await projectLink.click();
      await page.waitForLoadState("networkidle");
      console.log(`Found existing Supabase project "${projectName}"`);
    } else {
      // Step 4: Create new project
      console.log(`Creating new Supabase project "${projectName}"...`);

      // Selector may be fragile — Supabase may change button text
      const newProjectBtn = await page
        .waitForSelector(
          'a:has-text("New Project"), button:has-text("New Project"), a:has-text("New project"), button:has-text("New project")',
          { timeout: 10_000 }
        )
        .catch(() => null);

      if (!newProjectBtn) {
        throw new Error(
          'Could not find "New Project" button. The Supabase dashboard UI may have changed.'
        );
      }

      await newProjectBtn.click();
      await page.waitForLoadState("networkidle");

      // Select organization if prompted — use first available
      // Selector may be fragile
      const orgButton = await page
        .$('button[class*="org"], [data-testid="org-select"] button, .org-button')
        .catch(() => null);
      if (orgButton) {
        await orgButton.click();
        // Pick first org in the dropdown
        const firstOrg = await page
          .waitForSelector('[role="option"], [role="menuitem"], li', {
            timeout: 5_000,
          })
          .catch(() => null);
        if (firstOrg) {
          await firstOrg.click();
        }
      }

      // Fill in project name
      // Selector may be fragile — looks for project name input
      const nameInput = await page.waitForSelector(
        'input[id="project-name"], input[name="name"], input[placeholder*="project" i], input[placeholder*="name" i]',
        { timeout: 10_000 }
      );
      await nameInput.fill(projectName);

      // Generate a secure DB password
      const dbPassword = crypto.randomBytes(24).toString("base64url");

      // Fill in database password
      // Selector may be fragile
      const passwordInput = await page
        .waitForSelector(
          'input[id="db-password"], input[name="dbPass"], input[type="password"], input[placeholder*="password" i]',
          { timeout: 10_000 }
        )
        .catch(() => null);

      if (passwordInput) {
        await passwordInput.fill(dbPassword);
      }

      // Select region if opts.region is specified — otherwise leave default
      if (opts["region"]) {
        // Selector may be fragile — region is typically a listbox/select
        const regionSelect = await page
          .$(
            'button[id*="region"], [data-testid*="region"], button:has-text("Region")'
          )
          .catch(() => null);
        if (regionSelect) {
          await regionSelect.click();
          const regionOption = await page
            .waitForSelector(`[role="option"]:has-text("${opts["region"]}")`, {
              timeout: 5_000,
            })
            .catch(() => null);
          if (regionOption) {
            await regionOption.click();
          }
        }
      }

      // Select free tier (Pricing plan) — click the free plan option if visible
      // Selector may be fragile
      const freePlanOption = await page
        .$(
          'button:has-text("Free"), label:has-text("Free"), [data-testid*="free"]'
        )
        .catch(() => null);
      if (freePlanOption) {
        await freePlanOption.click();
      }

      // Click "Create new project"
      // Selector may be fragile
      const createBtn = await page
        .waitForSelector(
          'button:has-text("Create new project"), button:has-text("Create project"), button[type="submit"]',
          { timeout: 10_000 }
        )
        .catch(() => null);

      if (!createBtn) {
        throw new Error(
          'Could not find "Create new project" button. The UI may have changed.'
        );
      }

      await createBtn.click();

      // Check for free tier limit error
      const errorEl = await page
        .waitForSelector(
          'text=/free .* limit/i, text=/maximum .* project/i, [role="alert"]',
          { timeout: 5_000 }
        )
        .catch(() => null);

      if (errorEl) {
        const errorText = await errorEl.textContent();
        if (errorText?.toLowerCase().includes("limit") || errorText?.toLowerCase().includes("maximum")) {
          throw new Error(
            "Supabase free tier limited to 2 projects. Delete one at supabase.com/dashboard or upgrade."
          );
        }
      }

      // Wait for project to be ready — poll for up to 5 minutes
      console.log(
        "Waiting for Supabase project to be ready (this can take 1-3 minutes)..."
      );
      const startTime = Date.now();
      const timeoutMs = 5 * 60 * 1000;

      while (Date.now() - startTime < timeoutMs) {
        // Extract the project ref from the URL
        const urlMatch = page.url().match(/\/dashboard\/project\/([^/]+)/);
        if (urlMatch) {
          projectRef = urlMatch[1];
          createdProjectRef = projectRef;
        }

        // Check if the project dashboard has loaded (project is ready)
        const readyIndicator = await page
          .$(
            '[class*="ProjectLayout"], [data-testid="project-layout"], nav a[href*="/editor"], a[href*="/sql"]'
          )
          .catch(() => null);

        if (readyIndicator && projectRef) {
          console.log("Project is ready!");
          break;
        }

        const elapsed = Math.round((Date.now() - startTime) / 1000);
        process.stdout.write(`\r  Provisioning... ${elapsed}s elapsed`);
        await page.waitForTimeout(5_000);
      }

      if (!projectRef) {
        throw new Error(
          "Project is taking too long. Check supabase.com/dashboard manually."
        );
      }

      console.log(""); // newline after progress
    }

    // Step 5: Extract API keys from Settings > API
    const apiSettingsUrl = `https://supabase.com/dashboard/project/${projectRef}/settings/api`;
    await page.goto(apiSettingsUrl);
    await page.waitForLoadState("networkidle");
    // SPA may take time to render
    await page.waitForTimeout(3_000);

    // Extract Project URL (SUPABASE_URL)
    // Selector may be fragile — looks for the URL field
    let supabaseUrl: string | null = null;
    const urlInput = await page
      .$(
        'input[id*="url" i][readonly], input[value*="supabase.co"], span:has-text(".supabase.co"), code:has-text(".supabase.co")'
      )
      .catch(() => null);

    if (urlInput) {
      const tag = await urlInput.evaluate((el) => el.tagName.toLowerCase());
      supabaseUrl =
        tag === "input"
          ? await urlInput.inputValue()
          : await urlInput.textContent();
    }

    // Fallback: construct the URL from the project ref
    if (!supabaseUrl) {
      supabaseUrl = `https://${projectRef}.supabase.co`;
    }

    // Extract anon public key (SUPABASE_ANON_KEY)
    // Selector may be fragile — the anon key is typically in a labeled section
    let anonKey: string | null = null;
    const pageContent = await page.content();

    // Look for the anon key pattern (JWT-like token near "anon" text)
    const anonSection = await page
      .$(
        'text=/anon.*public/i, text=/anon/i'
      )
      .catch(() => null);

    if (anonSection) {
      // Find the nearest input/code element containing the key
      const anonContainer = await anonSection.evaluateHandle((el) => el.closest("div, tr, section") || el.parentElement);
      const anonKeyEl = await anonContainer.asElement()?.$(
        'input[readonly], code, span[class*="truncate"], input[type="text"]'
      );
      if (anonKeyEl) {
        const tag = await anonKeyEl.evaluate((el) => el.tagName.toLowerCase());
        anonKey =
          tag === "input"
            ? await anonKeyEl.inputValue()
            : await anonKeyEl.textContent();
      }
    }

    // Fallback: scan page content for JWT tokens (eyJ prefix)
    if (!anonKey) {
      const jwtMatches = pageContent.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g);
      if (jwtMatches && jwtMatches.length > 0) {
        anonKey = jwtMatches[0];
      }
    }

    // Extract service_role key (SUPABASE_SERVICE_ROLE_KEY) — may need to reveal it
    let serviceRoleKey: string | null = null;

    // Look for a "Reveal" button near service_role
    // Selector may be fragile
    const revealBtn = await page
      .$(
        'button:has-text("Reveal"), button:has-text("reveal"), button:has-text("Show")'
      )
      .catch(() => null);

    if (revealBtn) {
      await revealBtn.click();
      await page.waitForTimeout(1_000);
    }

    const serviceSection = await page
      .$(
        'text=/service.role/i, text=/service_role/i'
      )
      .catch(() => null);

    if (serviceSection) {
      const serviceContainer = await serviceSection.evaluateHandle((el) => el.closest("div, tr, section") || el.parentElement);
      const serviceKeyEl = await serviceContainer.asElement()?.$(
        'input[readonly], code, span[class*="truncate"], input[type="text"]'
      );
      if (serviceKeyEl) {
        const tag = await serviceKeyEl.evaluate((el) => el.tagName.toLowerCase());
        serviceRoleKey =
          tag === "input"
            ? await serviceKeyEl.inputValue()
            : await serviceKeyEl.textContent();
      }
    }

    // Fallback: get second JWT from page (first is anon, second is service_role)
    if (!serviceRoleKey) {
      const updatedContent = await page.content();
      const jwtMatches = updatedContent.match(
        /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g
      );
      if (jwtMatches && jwtMatches.length >= 2) {
        serviceRoleKey = jwtMatches[1];
      }
    }

    if (!anonKey || !serviceRoleKey) {
      throw new Error(
        "Could not extract API keys from Supabase settings page. The UI may have changed."
      );
    }

    // Step 6: Extract Database URL from Settings > Database
    const dbSettingsUrl = `https://supabase.com/dashboard/project/${projectRef}/settings/database`;
    await page.goto(dbSettingsUrl);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    let databaseUrl: string | null = null;

    // Look for the connection string / URI
    // Selector may be fragile
    const connStringEl = await page
      .$(
        'input[value*="postgresql://"], code:has-text("postgresql://"), span:has-text("postgresql://"), input[value*="postgres://"], code:has-text("postgres://")'
      )
      .catch(() => null);

    if (connStringEl) {
      const tag = await connStringEl.evaluate((el) =>
        el.tagName.toLowerCase()
      );
      databaseUrl =
        tag === "input"
          ? await connStringEl.inputValue()
          : await connStringEl.textContent();
    }

    // Fallback: scan page for postgres connection string
    if (!databaseUrl) {
      const dbPageContent = await page.content();
      const connMatch = dbPageContent.match(
        /postgres(?:ql)?:\/\/[^\s"'<]+/
      );
      databaseUrl = connMatch ? connMatch[0] : null;
    }

    // Construct a fallback DATABASE_URL if we still don't have one
    if (!databaseUrl) {
      databaseUrl = `postgresql://postgres:[YOUR-PASSWORD]@db.${projectRef}.supabase.co:5432/postgres`;
    }

    await page.close();

    return {
      vars: {
        SUPABASE_URL: supabaseUrl.trim(),
        SUPABASE_ANON_KEY: anonKey.trim(),
        SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey.trim(),
        DATABASE_URL: databaseUrl.trim(),
      },
      metadata: {
        projectId: projectRef ?? undefined,
        projectUrl: `https://supabase.com/dashboard/project/${projectRef}`,
        dbPassword:
          "Check your password manager or the value generated during provisioning",
      },
    };
  },

  async rollback(_context: BrowserContext): Promise<void> {
    if (createdProjectRef) {
      console.warn(
        `Warning: A Supabase project may have been partially created. ` +
          `Check: https://supabase.com/dashboard/project/${createdProjectRef}`
      );
    }
  },
};

registry.register(supabaseProvider);
