import { BrowserContext } from "playwright";
import { registry } from "./providers/index.js";
import { ProviderOpts } from "./types.js";
import { readEnv, writeEnv, ensureGitignore } from "./utils/env.js";
import { launchBrowser, closeBrowser } from "./browser.js";
import { printSummary, ProviderResult } from "./utils/summary.js";
import path from "path";

export interface OrchestrateOpts extends ProviderOpts {
  headless?: boolean;
  validate?: boolean;
}

export async function orchestrate(
  providerNames: string[],
  opts: OrchestrateOpts
): Promise<void> {
  // Validate all requested providers exist
  const unknown = providerNames.filter((n) => !registry.has(n));
  if (unknown.length > 0) {
    console.error(`Unknown providers: ${unknown.join(", ")}`);
    console.error(`Available: ${registry.list().join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const env = readEnv(opts.envFilePath);
  const results: ProviderResult[] = [];
  const allVars: Record<string, string> = {};
  let hasFailure = false;

  let context: BrowserContext | undefined;

  try {
    for (const name of providerNames) {
      const provider = registry.get(name)!;

      // Validate existing keys (check before detect so --validate always runs)
      if (opts.validate) {
        if (!provider.validate) {
          console.log(`[${name}] No validation available, skipping`);
          results.push({
            provider: name,
            keys: provider.requiredCredentials.map((k) => ({
              name: k,
              value: env[k] || "",
            })),
            status: "skipped",
          });
          continue;
        }
        console.log(`[${name}] Validating existing keys...`);
        const valid = await provider.validate(env);
        console.log(`[${name}] Validation: ${valid ? "PASS" : "FAIL"}`);
        results.push({
          provider: name,
          keys: provider.requiredCredentials.map((k) => ({
            name: k,
            value: env[k] || "",
          })),
          status: valid ? "skipped" : "failed",
        });
        continue;
      }

      // Detect existing keys
      if (provider.detect(env) && !opts.force) {
        console.log(`[${name}] Keys already exist, skipping (use --force to overwrite)`);
        results.push({
          provider: name,
          keys: provider.requiredCredentials.map((k) => ({
            name: k,
            value: env[k] || "",
          })),
          status: "skipped",
        });
        continue;
      }

      // Dry run
      if (opts.dryRun) {
        console.log(`[${name}] Would provision: ${provider.requiredCredentials.join(", ")}`);
        results.push({
          provider: name,
          keys: provider.requiredCredentials.map((k) => ({
            name: k,
            value: "(dry-run)",
          })),
          status: "skipped",
        });
        continue;
      }

      // Launch browser on first real provision
      if (!context) {
        context = await launchBrowser({ headless: opts.headless });
      }

      try {
        console.log(`[${name}] Provisioning...`);
        const result = await provider.provision(context, opts);
        Object.assign(allVars, result.vars);
        results.push({
          provider: name,
          keys: Object.entries(result.vars).map(([k, v]) => ({
            name: k,
            value: v,
          })),
          status: "written",
        });
        console.log(`[${name}] Done.`);
      } catch (err) {
        hasFailure = true;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[${name}] Failed: ${message}`);

        if (provider.rollback) {
          try {
            await provider.rollback(context);
            console.log(`[${name}] Rollback completed.`);
          } catch {
            console.error(`[${name}] Rollback also failed.`);
          }
        }

        results.push({
          provider: name,
          keys: [],
          status: "failed",
          error: message,
        });
      }
    }

    // Write collected vars to .env
    if (Object.keys(allVars).length > 0) {
      ensureGitignore(path.dirname(path.resolve(opts.envFilePath)));
      const writeResult = writeEnv(opts.envFilePath, allVars, {
        force: opts.force,
      });
      console.log(
        `\nWrote ${writeResult.written.length} key(s) to ${opts.envFilePath}`
      );
      if (writeResult.skipped.length > 0) {
        console.log(`Skipped ${writeResult.skipped.length} existing key(s)`);
      }
    }

    printSummary(results);
  } finally {
    if (context) {
      await closeBrowser(context);
    }
  }

  if (hasFailure) {
    process.exitCode = 1;
  }
}
