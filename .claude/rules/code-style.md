# Code Style — Autoprovision (kip)

## TypeScript Conventions

- TypeScript strict mode — all code must pass `npx tsc --noEmit`
- Target: ES2022, Module: Node16
- Use interfaces for public contracts (`Provider`, `ProvisionResult`), types for inline/union definitions
- PascalCase for interfaces/types, camelCase for functions/variables, UPPER_SNAKE_CASE for env var names
- Use async/await with try/catch — no raw `.then()` chains

## Import Rules

- All imports at the top of the file — no inline/dynamic imports
- Import order: Node.js builtins → external packages → internal modules
- Use `.js` extensions in all relative imports (required by Node16 module resolution)
- Example:
  ```typescript
  import { readFileSync } from "fs";
  import { BrowserContext } from "playwright";
  import { Provider, ProviderOpts, ProvisionResult } from "../types.js";
  import { registry } from "./registry.js";
  ```

## Avoid `any`

- Prefer `unknown` and narrow with type assertions: `as { field: type }`
- If `any` is unavoidable, add a comment explaining why

## Provider Pattern

Every provider file follows this structure:

1. **Imports** — types, registry
2. **Helper functions** — API wrappers (e.g., `stripeApi()`, `neonApi()`)
3. **Provider object** — implements `Provider` interface
4. **Self-registration** — `registry.register(provider)` at module level

```typescript
import { BrowserContext } from "playwright";
import { Provider, ProviderOpts, ProvisionResult } from "../types.js";
import { registry } from "./registry.js";

async function exampleApi(token: string, path: string): Promise<unknown> {
  // API helper
}

const exampleProvider: Provider = {
  name: "example",
  requiredCredentials: ["EXAMPLE_API_KEY"],
  detect(env) { return !!env["EXAMPLE_API_KEY"]; },
  async validate(env) { /* optional */ },
  async provision(context, opts) { /* main logic */ },
  async rollback(context) { /* optional cleanup */ },
};

registry.register(exampleProvider);
```

### Provider conventions

- Provider `name` must be lowercase kebab-case (e.g., `"openrouter"`, `"cloudflare"`)
- `requiredCredentials` lists all env var names the provider produces
- `detect()` checks if credentials already exist — return `true` to skip provisioning
- `validate()` makes a lightweight API call to verify keys work (GET only)
- `provision()` receives a `BrowserContext` even if unused (for API-only providers, prefix with `_`)
- Log progress with `console.log("[provider-name] message...")` — use bracket prefix
- Mask keys in logs: only show first 8-12 characters with `...`
- On error, throw with actionable context (what failed, what the user should do)
- `rollback()` should warn about manual cleanup, not attempt destructive operations

### Provisioning strategies (in order of preference)

1. **REST API** — use existing auth token/key to create scoped credentials (Vercel, Stripe, Neon)
2. **CLI-based** — leverage existing CLI auth (Supabase, Vercel fallback)
3. **Browser automation** — Playwright for complex auth flows (OpenRouter, Clerk, Resend fallback)

## Logging

- Use `console.log("[provider-name] ...")` for progress messages in providers
- Use `console.warn(...)` for non-fatal warnings (rollback messages)
- Use `console.error(...)` only in error paths
- Never log full API keys, tokens, or passwords — always mask/truncate

## Security

- Never hardcode API keys, tokens, or passwords in source code
- All credentials come from environment variables or local auth files (e.g., `~/.vercel/auth.json`)
- .env writes use atomic file operations (write .tmp, rename)
- .env files get mode `0o600` (user read/write only)
- Always ensure `.env` is in `.gitignore`
- Document required env vars in `.env.example`

## Error Handling

- Throw `Error` with descriptive messages including:
  - What operation failed
  - Where to get missing credentials (URL to dashboard)
- API helpers should include status code and response body in error messages
- Provider `provision()` should clean up partial state on failure when possible

## File Organization

```
src/
  types.ts              # Shared interfaces (Provider, ProvisionResult, ProviderOpts)
  browser.ts            # Playwright browser context management
  orchestrator.ts       # Main orchestration loop
  index.ts              # CLI entrypoint (commander)
  providers/
    registry.ts         # Provider registry (Map-based, register/get/list)
    index.ts            # Auto-imports all provider files
    <provider>.ts       # One file per provider, self-registering
  utils/
    env.ts              # .env read/write, gitignore, key masking
    notify.ts           # macOS notifications
    summary.ts          # Results table printer
  auth/
    agentmail.ts        # AgentMail SDK for email verification
```
