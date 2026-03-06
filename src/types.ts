import { BrowserContext } from "playwright";

export interface ProviderOpts {
  projectName?: string;
  envFilePath: string;
  force?: boolean;
  dryRun?: boolean;
  [key: string]: unknown;
}

export interface ProvisionResult {
  vars: Record<string, string>;
  metadata?: {
    projectId?: string;
    projectUrl?: string;
    [key: string]: unknown;
  };
}

export interface Provider {
  /** Unique identifier, e.g. "supabase", "openrouter" */
  name: string;

  /** Env var names this provider produces */
  requiredCredentials: string[];

  /** Check if existing env vars are already set (skip if so) */
  detect(env: Record<string, string>): boolean;

  /** Validate existing keys actually work (optional) */
  validate?(env: Record<string, string>): Promise<boolean>;

  /** Run the browser flow to provision and extract keys */
  provision(
    context: BrowserContext,
    opts: ProviderOpts
  ): Promise<ProvisionResult>;

  /** Clean up on failure (optional) */
  rollback?(context: BrowserContext): Promise<void>;
}
