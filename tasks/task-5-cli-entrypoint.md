# Task 5: CLI Entrypoint + Orchestrator

## Tab: Terminal 5

## Prerequisites
Depends on all other tasks. Start by creating the file structure, then wait for others to finish before final integration test.

## What to build

### 1. `src/index.ts` — CLI Entrypoint
Use `commander` to build the CLI:

```
autoprovision [providers...] [options]

Arguments:
  providers       Services to provision (e.g., "supabase openrouter")

Options:
  --env <path>    Path to .env file (default: "./.env")
  --force         Overwrite existing keys
  --dry-run       Show what would be provisioned without doing it
  --headless      Run browser in headless mode
  --validate      Check if existing keys work
  --project <n>   Project name for services that create projects (default: "autoprovision")
  -h, --help      Show help
```

### 2. `src/orchestrator.ts` — Main orchestration logic
Export `async function orchestrate(providerNames: string[], opts: ProviderOpts)`:

1. Import and initialize the provider registry (`src/providers/index.ts`)
2. Validate all requested provider names exist in registry
3. Read existing .env file
4. For each provider (sequentially — they share one browser):
   a. Run `provider.detect(env)` — if true and not `--force`, skip with message
   b. If `--validate` and `provider.validate`, run it and report
   c. If `--dry-run`, just print what would happen and skip
   d. Launch browser (reuse same context across providers)
   e. Run `provider.provision(context, opts)`
   f. Collect results
   g. On error: run `provider.rollback?()`, log error, continue to next provider
5. After all providers: write all collected vars to .env (single atomic write)
6. Print summary table: provider | keys written | status
7. Clean up browser

### 3. `src/utils/summary.ts` — Pretty output
- Export `printSummary(results)` that prints a formatted table
- Use `maskKey()` from env utils to mask key values in output
- Show: provider name, each key name, masked value, status (written/skipped/failed)

### 4. `package.json` updates
- Add `"bin": { "autoprovision": "./dist/index.js" }`
- Add scripts: `"build": "tsc"`, `"start": "node dist/index.js"`
- Add shebang `#!/usr/bin/env node` at top of `src/index.ts`

### 5. `.gitignore`
Create with: `node_modules`, `dist`, `.env`, `.env.tmp`, `*.js.map`

## Key behaviors
- If no providers specified, list available ones and exit
- If a provider fails, continue with remaining providers (don't abort all)
- Always ensure browser is closed in a `finally` block
- Always ensure .gitignore has `.env` before writing any keys
- Exit code: 0 if all succeeded, 1 if any failed

## Files to create
- `src/index.ts`
- `src/orchestrator.ts`
- `src/utils/summary.ts`
- `.gitignore`

## Testing with Claude Code Chrome
After building, you can test the browser flows using Claude Code's native Chrome integration:
```
claude --chrome 'Run node dist/index.js openrouter and help me through the flow'
```
This uses Claude's built-in Chrome bridge — it can see the browser, handle navigation, and pause for you on CAPTCHAs/2FA. Good for verifying selectors work.

## When done
Run `npm run build` to compile. Then test with `node dist/index.js --help`. Then:
```
osascript -e 'display notification "Task 5 complete: CLI ready!" with title "Autoprovision"'
```
