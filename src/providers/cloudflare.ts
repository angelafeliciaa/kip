import { BrowserContext } from "playwright";
import { Provider, ProviderOpts, ProvisionResult } from "../types.js";
import { registry } from "./registry.js";

async function cloudflareApi(
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

  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method: opts?.method || "GET",
    headers,
    ...(opts?.body ? { body: JSON.stringify(opts.body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cloudflare API ${res.status}: ${text}`);
  }

  return res.json();
}

const cloudflareProvider: Provider = {
  name: "cloudflare",
  requiredCredentials: [
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
  ],

  detect(env: Record<string, string>): boolean {
    return !!env["CLOUDFLARE_API_TOKEN"] && !!env["CLOUDFLARE_ACCOUNT_ID"];
  },

  async validate(env: Record<string, string>): Promise<boolean> {
    const token = env["CLOUDFLARE_API_TOKEN"];
    if (!token) return false;
    try {
      const res = await fetch(
        "https://api.cloudflare.com/client/v4/user/tokens/verify",
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return res.status === 200;
    } catch {
      return false;
    }
  },

  async provision(
    _context: BrowserContext,
    opts: ProviderOpts
  ): Promise<ProvisionResult> {
    const globalApiKey = process.env["CLOUDFLARE_API_KEY"];
    const email = process.env["CLOUDFLARE_EMAIL"];

    if (!globalApiKey || !email) {
      throw new Error(
        "Cloudflare requires CLOUDFLARE_API_KEY and CLOUDFLARE_EMAIL env vars.\n" +
          "Get your Global API Key from https://dash.cloudflare.com/profile/api-tokens"
      );
    }

    console.log("[cloudflare] Fetching account info...");

    // Get account ID using Global API Key
    const accountsRes = (await fetch(
      "https://api.cloudflare.com/client/v4/accounts",
      {
        headers: {
          "X-Auth-Email": email,
          "X-Auth-Key": globalApiKey,
        },
      }
    ).then((r) => r.json())) as {
      result: { id: string; name: string }[];
    };

    if (!accountsRes.result?.length) {
      throw new Error("No Cloudflare accounts found for this email.");
    }

    const accountId = accountsRes.result[0].id;
    const accountName = accountsRes.result[0].name;
    console.log(`[cloudflare] Using account "${accountName}" (${accountId})`);

    // Create a scoped API token
    const tokenName = `kip-${opts.projectName || "autoprovision"}-${Date.now()}`;
    console.log(`[cloudflare] Creating API token "${tokenName}"...`);

    const tokenRes = (await fetch(
      "https://api.cloudflare.com/client/v4/user/tokens",
      {
        method: "POST",
        headers: {
          "X-Auth-Email": email,
          "X-Auth-Key": globalApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: tokenName,
          policies: [
            {
              effect: "allow",
              resources: {
                [`com.cloudflare.api.account.${accountId}`]: "*",
              },
              permission_groups: [
                { id: "e086da7e2179491d91ee5f35b3ca210a", name: "Workers Scripts Write" },
                { id: "c1fde68c7bcc44588cbb6ddbc16d6480", name: "Account Settings Read" },
              ],
            },
          ],
        }),
      }
    ).then((r) => r.json())) as {
      result: { id: string; value: string };
    };

    if (!tokenRes.result?.value) {
      throw new Error("Cloudflare API did not return a token value.");
    }

    console.log(`[cloudflare] Created token: ${tokenRes.result.value.slice(0, 12)}...`);

    return {
      vars: {
        CLOUDFLARE_API_TOKEN: tokenRes.result.value,
        CLOUDFLARE_ACCOUNT_ID: accountId,
      },
      metadata: {
        projectUrl: `https://dash.cloudflare.com/${accountId}`,
      },
    };
  },

  async rollback(_context: BrowserContext): Promise<void> {
    console.warn(
      "Note: If tokens were partially created, check dash.cloudflare.com/profile/api-tokens to clean up."
    );
  },
};

registry.register(cloudflareProvider);
