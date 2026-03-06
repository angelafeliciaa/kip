# Autoprovision

CLI tool that uses Playwright browser automation to provision cloud services and extract API keys.

## Project Structure
```
src/
  types.ts            # Shared Provider interface and types
  browser.ts          # Playwright persistent browser context manager
  orchestrator.ts     # Main orchestration loop
  index.ts            # CLI entrypoint (commander)
  providers/
    registry.ts       # Provider registry (register/get/list)
    index.ts          # Auto-imports all providers
    openrouter.ts     # OpenRouter API key provider
    supabase.ts       # Supabase project + keys provider
  utils/
    env.ts            # .env read/write, gitignore check, key masking
    notify.ts         # macOS notifications + waitForUser
    summary.ts        # Pretty-print results table
```

## Commands
- `npm run build` — compile TypeScript
- `npx tsc --noEmit` — type-check without emitting
- `node dist/index.js --help` — run CLI

## Conventions
- TypeScript strict mode
- No yarn, npm only
- Provider files self-register with the registry at import time
- .env writes are atomic (write .tmp, rename)
- Never overwrite existing .env keys without --force
- Browser runs headed (visible) by default for user interaction

## Testing browser flows
Use `claude --chrome` to test with Claude Code's native Chrome integration.
