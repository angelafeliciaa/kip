#!/usr/bin/env node
import { Command } from "commander";
import { registry } from "./providers/index.js";
import { orchestrate } from "./orchestrator.js";

const program = new Command();

program
  .name("autoprovision")
  .description("Provision cloud services and extract API keys via browser automation")
  .argument("[providers...]", "Services to provision (e.g., supabase openrouter)")
  .option("--env <path>", "Path to .env file", "./.env")
  .option("--force", "Overwrite existing keys", false)
  .option("--dry-run", "Show what would be provisioned without doing it", false)
  .option("--headless", "Run browser in headless mode", false)
  .option("--validate", "Check if existing keys work", false)
  .option("--project <name>", "Project name for services that create projects", "autoprovision")
  .action(async (providers: string[], options) => {
    // If no providers specified, list available ones
    if (providers.length === 0) {
      const available = registry.list();
      console.log("Available providers:");
      for (const name of available) {
        console.log(`  - ${name}`);
      }
      console.log(`\nUsage: autoprovision <provider> [provider...] [options]`);
      return;
    }

    try {
      await orchestrate(providers, {
        envFilePath: options.env,
        force: options.force,
        dryRun: options.dryRun,
        headless: options.headless,
        validate: options.validate,
        projectName: options.project,
      });
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

program.parse();
