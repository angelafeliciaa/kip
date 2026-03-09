import { BrowserContext } from "playwright";
import { Provider, ProviderOpts, ProvisionResult } from "../types.js";
import { registry } from "./registry.js";

async function clerkApi(
  token: string,
  path: string,
  opts?: { method?: string; body?: unknown }
): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (opts?.body) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`https://api.clerk.com/v1${path}`, {
    method: opts?.method || "GET",
    headers,
    ...(opts?.body ? { body: JSON.stringify(opts.body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clerk API ${res.status}: ${text}`);
  }

  return res.json();
}

const clerkProvider: Provider = {
  name: "clerk",
  requiredCredentials: [
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "CLERK_SECRET_KEY",
  ],

  detect(env: Record<string, string>): boolean {
    return (
      !!env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] && !!env["CLERK_SECRET_KEY"]
    );
  },

  async validate(env: Record<string, string>): Promise<boolean> {
    const key = env["CLERK_SECRET_KEY"];
    if (!key) return false;
    try {
      const res = await fetch("https://api.clerk.com/v1/clients", {
        headers: { Authorization: `Bearer ${key}` },
      });
      return res.status === 200;
    } catch {
      return false;
    }
  },

  async provision(
    context: BrowserContext,
    opts: ProviderOpts
  ): Promise<ProvisionResult> {
    const existingSecret = process.env["CLERK_SECRET_KEY"];
    if (existingSecret) {
      console.log("[clerk] Found existing CLERK_SECRET_KEY, fetching instance info...");

      const instance = (await clerkApi(existingSecret, "/instance")) as {
        id: string;
        environment_type: string;
        home_url: string;
      };

      // Fetch API keys from the instance
      const keysRes = (await clerkApi(existingSecret, "/api_keys")) as {
        data: { id: string; secret: string; type: string; name: string }[];
      };

      const publishableKey = keysRes.data.find((k) => k.type === "publishable");
      if (!publishableKey) {
        throw new Error("Could not find publishable key for Clerk instance.");
      }

      return {
        vars: {
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey.secret,
          CLERK_SECRET_KEY: existingSecret,
        },
        metadata: {
          projectId: instance.id,
          projectUrl: instance.home_url,
        },
      };
    }

    // Browser-based provisioning
    console.log("[clerk] No existing key found. Opening Clerk dashboard...");
    const page = await context.newPage();

    try {
      await page.goto("https://dashboard.clerk.com/sign-in");
      console.log("[clerk] Please sign in to Clerk and navigate to your application.");
      console.log("[clerk] Waiting for API keys page...");

      await page.waitForURL("**/api-keys**", { timeout: 300_000 });

      // Extract keys from the page
      const content = await page.content();

      const publishableMatch = content.match(/pk_(test|live)_[A-Za-z0-9]+/);
      const secretMatch = content.match(/sk_(test|live)_[A-Za-z0-9]+/);

      if (!publishableMatch || !secretMatch) {
        throw new Error(
          "Could not extract Clerk API keys from the dashboard page.\n" +
            "Navigate to API Keys and ensure both keys are visible."
        );
      }

      console.log(`[clerk] Got publishable key: ${publishableMatch[0].slice(0, 12)}...`);
      console.log(`[clerk] Got secret key: ${secretMatch[0].slice(0, 12)}...`);

      return {
        vars: {
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableMatch[0],
          CLERK_SECRET_KEY: secretMatch[0],
        },
        metadata: {
          projectUrl: "https://dashboard.clerk.com",
        },
      };
    } finally {
      await page.close();
    }
  },
};

registry.register(clerkProvider);
