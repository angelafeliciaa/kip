# Task 1: Browser Session Manager + Env Utility

## Tab: Terminal 1

## What to build
Two modules that every other part depends on:

### 1. `src/browser.ts` — Browser Session Manager
- Export a function `launchBrowser(opts?)` that creates a Playwright **persistent context** (not a regular browser)
- Store browser data in `~/.autoprovision/browser-data/` so sessions persist between runs
- Launch in **headed mode** by default (`headless: false`) so user can interact (CAPTCHA, 2FA)
- Accept an optional `headless: boolean` override
- Set a reasonable viewport (1280x800)
- Set a realistic user-agent to avoid bot detection
- Export a `closeBrowser(context)` cleanup function
- Handle the case where the data dir doesn't exist yet (create it)

### 2. `src/utils/env.ts` — Env File Utility
- Export `readEnv(filePath: string): Record<string, string>` — parse a .env file into key-value pairs. Handle comments, empty lines, quoted values. Use the `dotenv` package for parsing.
- Export `writeEnv(filePath: string, vars: Record<string, string>, opts?: { force?: boolean }): void`
  - Read existing .env if it exists
  - Merge new vars in. **Never overwrite** existing keys unless `force: true`
  - Write atomically: write to `.env.tmp`, then rename to `.env`
  - Set file permissions to `0o600` (owner-only)
  - Return which keys were written vs skipped
- Export `ensureGitignore(dir: string): void` — check if `.gitignore` in the given dir contains `.env`. If not, append it and log a warning.
- Export `maskKey(key: string): string` — show first 6 and last 4 chars, mask the rest. E.g. `sk-or-...a1b2`

## Shared types
Import `Provider`, `ProviderOpts`, `ProvisionResult` from `../types.ts` (already created).

## Key constraints
- No Chrome profile reuse — fresh persistent context only
- Atomic writes for .env
- File permissions 600 on .env
- Use `fs.mkdirSync(..., { recursive: true })` for creating dirs

## Files to create
- `src/browser.ts`
- `src/utils/env.ts`

## When done
Run `npx tsc --noEmit` to verify no type errors. Send a macOS notification:
```
osascript -e 'display notification "Task 1 complete: Browser + Env" with title "Autoprovision"'
```
