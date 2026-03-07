import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { BrowserContext } from "playwright";
import { Provider, ProviderOpts, ProvisionResult } from "../types.js";
import { registry } from "./registry.js";

function getVercelToken(): string {
  const authPath = join(homedir(), ".vercel", "auth.json");
  try {
    const auth = JSON.parse(readFileSync(authPath, "utf-8"));
    if (auth.token) return auth.token;
  } catch {
    // fall through
  }
  throw new Error(
    "Vercel CLI not authenticated. Run 'vercel login' first."
  );
}

async function vercelApi(
  token: string,
  path: string,
  opts?: { method?: string; body?: unknown; teamId?: string }
): Promise<unknown> {
  const url = new URL(`https://api.vercel.com${path}`);
  if (opts?.teamId) url.searchParams.set("teamId", opts.teamId);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (opts?.body) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url.toString(), {
    method: opts?.method || "GET",
    headers,
    ...(opts?.body ? { body: JSON.stringify(opts.body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vercel API ${res.status}: ${text}`);
  }

  return res.json();
}

const vercelProvider: Provider = {
  name: "vercel",
  requiredCredentials: ["VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID"],

  detect(env: Record<string, string>): boolean {
    return (
      !!env["VERCEL_TOKEN"] &&
      !!env["VERCEL_ORG_ID"] &&
      !!env["VERCEL_PROJECT_ID"]
    );
  },

  async validate(env: Record<string, string>): Promise<boolean> {
    const token = env["VERCEL_TOKEN"];
    if (!token) return false;
    try {
      const res = await fetch("https://api.vercel.com/v2/user", {
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
    // 1. Read CLI auth token
    const cliToken = getVercelToken();
    console.log("[vercel] Found Vercel CLI auth token.");

    // 2. Get user info to find default team/org
    const userRes = (await vercelApi(cliToken, "/v2/user")) as {
      user?: { id?: string; username?: string; defaultTeamId?: string };
    };
    if (!userRes.user?.id || !userRes.user?.username) {
      throw new Error("Failed to retrieve Vercel user info. Is the CLI token valid?");
    }
    const userId = userRes.user.id;
    const teamId = userRes.user.defaultTeamId;
    const orgId = teamId || userId;
    const username = userRes.user.username;
    console.log(`[vercel] Authenticated as ${username} (org: ${orgId})`);

    // 3. Find or create project
    const projectName = opts.projectName || "autoprovision";
    let projectId: string | undefined;

    const projects = (await vercelApi(cliToken, "/v9/projects", {
      teamId: teamId || undefined,
    })) as { projects: { id: string; name: string }[] };

    const existing = projects.projects.find((p) => p.name === projectName);
    if (existing) {
      projectId = existing.id;
      console.log(`[vercel] Found existing project "${projectName}" (${projectId})`);
    } else {
      console.log(`[vercel] Creating project "${projectName}"...`);
      const created = (await vercelApi(cliToken, "/v10/projects", {
        method: "POST",
        body: { name: projectName, framework: null },
        teamId: teamId || undefined,
      })) as { id: string; name: string };
      projectId = created.id;
      console.log(`[vercel] Created project "${projectName}" (${projectId})`);
    }

    // 4. Create a scoped deploy token
    const tokenName = `kip-${Date.now()}`;
    console.log(`[vercel] Creating API token "${tokenName}"...`);
    const tokenRes = (await vercelApi(cliToken, "/v3/user/tokens", {
      method: "POST",
      body: { name: tokenName },
    })) as { token?: { id: string }; bearerToken?: string };

    if (!tokenRes.bearerToken) {
      throw new Error("Vercel API did not return a bearer token. Token creation may have failed.");
    }

    const deployToken = tokenRes.bearerToken;
    console.log(`[vercel] Got token: ${deployToken.slice(0, 8)}...`);

    return {
      vars: {
        VERCEL_TOKEN: deployToken,
        VERCEL_ORG_ID: orgId,
        VERCEL_PROJECT_ID: projectId,
      },
      metadata: {
        projectId,
        projectUrl: `https://vercel.com/${username}/${projectName}`,
      },
    };
  },

  async rollback(_context: BrowserContext): Promise<void> {
    console.warn(
      "Note: If a project was partially created, check vercel.com/dashboard to clean up."
    );
  },
};

registry.register(vercelProvider);
