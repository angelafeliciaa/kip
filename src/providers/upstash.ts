import { BrowserContext } from "playwright";
import { Provider, ProviderOpts, ProvisionResult } from "../types.js";
import { registry } from "./registry.js";

async function upstashApi(
  email: string,
  apiKey: string,
  path: string,
  opts?: { method?: string; body?: unknown }
): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`${email}:${apiKey}`).toString("base64")}`,
  };
  if (opts?.body) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`https://api.upstash.com/v2${path}`, {
    method: opts?.method || "GET",
    headers,
    ...(opts?.body ? { body: JSON.stringify(opts.body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upstash API ${res.status}: ${text}`);
  }

  return res.json();
}

const upstashProvider: Provider = {
  name: "upstash",
  requiredCredentials: [
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ],

  detect(env: Record<string, string>): boolean {
    return (
      !!env["UPSTASH_REDIS_REST_URL"] && !!env["UPSTASH_REDIS_REST_TOKEN"]
    );
  },

  async validate(env: Record<string, string>): Promise<boolean> {
    const url = env["UPSTASH_REDIS_REST_URL"];
    const token = env["UPSTASH_REDIS_REST_TOKEN"];
    if (!url || !token) return false;
    try {
      const res = await fetch(`${url}/ping`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.status === 200;
    } catch {
      return false;
    }
  },

  async provision(
    _context: BrowserContext,
    opts: ProviderOpts
  ): Promise<ProvisionResult> {
    const email = process.env["UPSTASH_EMAIL"];
    const apiKey = process.env["UPSTASH_API_KEY"];

    if (!email || !apiKey) {
      throw new Error(
        "Upstash requires UPSTASH_EMAIL and UPSTASH_API_KEY env vars.\n" +
          "Get them from https://console.upstash.com/account/api"
      );
    }

    const dbName = `kip-${opts.projectName || "autoprovision"}`;
    console.log(`[upstash] Creating Redis database "${dbName}"...`);

    // List existing databases to check for duplicates
    const databases = (await upstashApi(email, apiKey, "/redis/databases")) as {
      database_id: string;
      database_name: string;
      endpoint: string;
      rest_token: string;
    }[];

    const existing = databases.find((db) => db.database_name === dbName);
    if (existing) {
      console.log(`[upstash] Found existing database "${dbName}".`);
      return {
        vars: {
          UPSTASH_REDIS_REST_URL: `https://${existing.endpoint}`,
          UPSTASH_REDIS_REST_TOKEN: existing.rest_token,
        },
        metadata: {
          projectId: existing.database_id,
          projectUrl: `https://console.upstash.com/redis/${existing.database_id}`,
        },
      };
    }

    // Create new database
    const created = (await upstashApi(email, apiKey, "/redis/database", {
      method: "POST",
      body: {
        name: dbName,
        region: "us-east-1",
        tls: true,
      },
    })) as {
      database_id: string;
      endpoint: string;
      rest_token: string;
    };

    console.log(`[upstash] Created database: ${created.database_id}`);

    return {
      vars: {
        UPSTASH_REDIS_REST_URL: `https://${created.endpoint}`,
        UPSTASH_REDIS_REST_TOKEN: created.rest_token,
      },
      metadata: {
        projectId: created.database_id,
        projectUrl: `https://console.upstash.com/redis/${created.database_id}`,
      },
    };
  },

  async rollback(_context: BrowserContext): Promise<void> {
    console.warn(
      "Note: If a database was partially created, check console.upstash.com to clean up."
    );
  },
};

registry.register(upstashProvider);
