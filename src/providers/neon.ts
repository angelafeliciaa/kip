import { BrowserContext } from "playwright";
import { Provider, ProviderOpts, ProvisionResult } from "../types.js";
import { registry } from "./registry.js";

async function neonApi(
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

  const res = await fetch(`https://console.neon.tech/api/v2${path}`, {
    method: opts?.method || "GET",
    headers,
    ...(opts?.body ? { body: JSON.stringify(opts.body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Neon API ${res.status}: ${text}`);
  }

  return res.json();
}

const neonProvider: Provider = {
  name: "neon",
  requiredCredentials: ["NEON_DATABASE_URL", "NEON_API_KEY"],

  detect(env: Record<string, string>): boolean {
    return !!env["NEON_DATABASE_URL"];
  },

  async validate(env: Record<string, string>): Promise<boolean> {
    const apiKey = env["NEON_API_KEY"];
    if (!apiKey) return false;
    try {
      const res = await fetch("https://console.neon.tech/api/v2/projects", {
        headers: { Authorization: `Bearer ${apiKey}` },
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
    const apiKey = process.env["NEON_API_KEY"];
    if (!apiKey) {
      throw new Error(
        "Neon requires NEON_API_KEY env var.\n" +
          "Get one from https://console.neon.tech/app/settings/api-keys"
      );
    }

    const projectName = `kip-${opts.projectName || "autoprovision"}`;
    console.log(`[neon] Checking for existing project "${projectName}"...`);

    // Check for existing project
    const projectsRes = (await neonApi(apiKey, "/projects")) as {
      projects: { id: string; name: string }[];
    };

    let projectId: string;
    let connectionUri: string;

    const existing = projectsRes.projects.find((p) => p.name === projectName);
    if (existing) {
      projectId = existing.id;
      console.log(`[neon] Found existing project "${projectName}" (${projectId})`);

      // Get connection URI for existing project
      const connRes = (await neonApi(
        apiKey,
        `/projects/${projectId}/connection_uri`
      )) as { uri: string };
      connectionUri = connRes.uri;
    } else {
      console.log(`[neon] Creating project "${projectName}"...`);

      const created = (await neonApi(apiKey, "/projects", {
        method: "POST",
        body: {
          project: {
            name: projectName,
            pg_version: 16,
          },
        },
      })) as {
        project: { id: string; name: string };
        connection_uris: { connection_uri: string }[];
      };

      projectId = created.project.id;
      connectionUri = created.connection_uris[0]?.connection_uri || "";
      console.log(`[neon] Created project "${projectName}" (${projectId})`);
    }

    if (!connectionUri) {
      throw new Error("Neon did not return a connection URI.");
    }

    console.log(`[neon] Got connection URI: ${connectionUri.slice(0, 30)}...`);

    return {
      vars: {
        NEON_DATABASE_URL: connectionUri,
        NEON_API_KEY: apiKey,
      },
      metadata: {
        projectId,
        projectUrl: `https://console.neon.tech/app/projects/${projectId}`,
      },
    };
  },

  async rollback(_context: BrowserContext): Promise<void> {
    console.warn(
      "Note: If a project was partially created, check console.neon.tech to clean up."
    );
  },
};

registry.register(neonProvider);
