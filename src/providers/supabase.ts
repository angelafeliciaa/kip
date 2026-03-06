import crypto from "crypto";
import { execSync } from "child_process";
import { BrowserContext } from "playwright";
import { Provider, ProviderOpts, ProvisionResult } from "../types.js";
import { registry } from "./registry.js";

interface SupabaseApiKey {
  api_key: string;
  name: string;
  id: string;
}

interface SupabaseProject {
  id: string;
  name: string;
  region: string;
  organization_id: string;
}

function runSupabase(args: string): string {
  return execSync(`supabase ${args}`, { encoding: "utf-8" }).trim();
}

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
    _context: BrowserContext,
    opts: ProviderOpts
  ): Promise<ProvisionResult> {
    // Check supabase CLI is installed and authenticated
    try {
      runSupabase("projects list -o json");
    } catch {
      throw new Error(
        "Supabase CLI not authenticated. Run 'supabase login' first."
      );
    }

    const projectName = opts.projectName || "autoprovision";
    const region = (opts["region"] as string) || "us-west-1";

    // Check for existing project with matching name
    const projectsJson = runSupabase("projects list -o json");
    const projects: SupabaseProject[] = JSON.parse(projectsJson);
    let project = projects.find((p) => p.name === projectName);
    let dbPassword: string | undefined;

    if (project) {
      console.log(`[supabase] Found existing project "${projectName}" (${project.id})`);
    } else {
      // Create new project
      console.log(`[supabase] Creating project "${projectName}"...`);
      dbPassword = crypto.randomBytes(24).toString("base64url");

      // Get first org ID
      const orgId = projects[0]?.organization_id;
      if (!orgId) {
        throw new Error("No Supabase organization found. Create one at supabase.com/dashboard.");
      }

      const createOutput = runSupabase(
        `projects create "${projectName}" --org-id ${orgId} --db-password "${dbPassword}" --region ${region} -o json`
      );
      project = JSON.parse(createOutput);

      // Wait for project to be ready
      console.log("[supabase] Waiting for project to be ready...");
      const startTime = Date.now();
      const timeoutMs = 5 * 60 * 1000;

      while (Date.now() - startTime < timeoutMs) {
        try {
          // API keys become available once the project is ready
          const keysJson = runSupabase(
            `projects api-keys --project-ref ${project!.id} -o json`
          );
          const keys = JSON.parse(keysJson);
          if (keys.length > 0) {
            console.log("[supabase] Project ready!");
            break;
          }
        } catch {
          // Not ready yet
        }
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        process.stdout.write(`\r  Provisioning... ${elapsed}s elapsed`);
        await new Promise((r) => setTimeout(r, 5000));
      }
      console.log("");
    }

    const ref = project!.id;

    // Get API keys
    const keysJson = runSupabase(
      `projects api-keys --project-ref ${ref} -o json`
    );
    const keys: SupabaseApiKey[] = JSON.parse(keysJson);

    const anonKey = keys.find((k) => k.name === "anon" || k.id === "anon");
    const serviceKey = keys.find(
      (k) => k.name === "service_role" || k.id === "service_role"
    );

    if (!anonKey || !serviceKey) {
      throw new Error(
        `Could not find API keys for project ${ref}. Keys found: ${keys.map((k) => k.name).join(", ")}`
      );
    }

    const supabaseUrl = `https://${ref}.supabase.co`;
    const databaseUrl = dbPassword
      ? `postgresql://postgres.${ref}:${dbPassword}@aws-0-${region}.pooler.supabase.com:6543/postgres`
      : `postgresql://postgres.${ref}:[YOUR-PASSWORD]@aws-0-${region}.pooler.supabase.com:6543/postgres`;

    return {
      vars: {
        SUPABASE_URL: supabaseUrl,
        SUPABASE_ANON_KEY: anonKey.api_key,
        SUPABASE_SERVICE_ROLE_KEY: serviceKey.api_key,
        DATABASE_URL: databaseUrl,
      },
      metadata: {
        projectId: ref,
        projectUrl: `https://supabase.com/dashboard/project/${ref}`,
        ...(dbPassword ? { dbPassword } : {}),
      },
    };
  },

  async rollback(_context: BrowserContext): Promise<void> {
    console.warn(
      "Note: If a project was partially created, check supabase.com/dashboard to clean up."
    );
  },
};

registry.register(supabaseProvider);
