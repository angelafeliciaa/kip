<p align="center">
  <img src="assets/logo.svg" alt="Kip" width="160" />
</p>

<h1 align="center">kip</h1>

<p align="center">
  <strong>Auto-provision cloud API keys so you don't have to.</strong><br/>
  Signs up, verifies emails, extracts keys, writes to .env. You do nothing.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node >= 18" />
  <img src="https://img.shields.io/badge/typescript-strict-blue" alt="TypeScript Strict" />
  <img src="https://img.shields.io/badge/license-MIT-lightgrey" alt="License" />
</p>

---

## What is **kip**?

**kip** is a CLI tool that uses **Playwright browser automation** and **AI agents** to provision cloud services and extract API keys automatically. Point it at a provider, and it handles the signup flow, email verification (via [AgentMail](https://agentmail.to)), and credential extraction — writing everything to your `.env`.

Think of it as a coyote: resourceful, fast, gets things done while nobody's watching.

## Supported Providers

| Provider | Keys Provisioned |
|----------|-----------------|
| **OpenRouter** | `OPENROUTER_API_KEY` |
| **Supabase** | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` |

and more coming soon!!! create an issue to request providers.

## Quick Start

```bash
# Install dependencies
npm install

# Set up your .env (you need these to start)
AGENTMAIL_API_KEY=am_... # from https://console.agentmail.to
AGENT_EMAIL=you@agentmail.to
AGENT_PASSWORD=yourpassword!
ANTHROPIC_API_KEY=haha  # powers the AI browser agent. can also use openai

# Build
npm run build

# Provision a service
node dist/index.js openrouter
```

## Usage

```
Usage: autoprovision [options] [providers...]

Provision cloud services and extract API keys via browser automation

Arguments:
  providers              Services to provision (e.g., supabase openrouter)

Options:
  --env <path>           Path to .env file (default: "./.env")
  --force                Overwrite existing keys (default: false)
  --dry-run              Show what would be provisioned without doing it
  --headless             Run browser in headless mode (default: false)
  --validate             Check if existing keys work
  --project <name>       Project name for services that create projects (default: "autoprovision")
  -h, --help             Display help
```

### Examples

```bash
# List available providers
node dist/index.js

# Provision OpenRouter (skips if key exists)
node dist/index.js openrouter

# Force re-provision with a new key
node dist/index.js openrouter --force

# Provision multiple services
node dist/index.js openrouter supabase

# Validate existing keys without provisioning
node dist/index.js openrouter --validate

# Dry run — see what would happen
node dist/index.js openrouter supabase --dry-run
```

## How It Works

```
CLI --> Orchestrator --> Provider --> .env
                            |
                     +-----------+
                     |           |
                 Playwright   AgentMail
                 (browser)    (email rx)
```

1. **CLI** parses your command and resolves providers
2. **Orchestrator** checks for existing keys, launches the browser, runs providers sequentially
3. **Provider** drives the browser through signup/login flows
4. **AgentMail** receives verification emails and extracts codes/links
5. **Credentials** are written atomically to `.env`

## Project Structure

```
src/
  index.ts              # CLI entrypoint (commander)
  orchestrator.ts       # Main orchestration loop
  browser.ts            # Playwright persistent browser context
  types.ts              # Shared Provider interface and types
  auth/
    agentmail.ts        # AgentMail inbox + email verification polling
  providers/
    registry.ts         # Provider registry (register/get/list)
    index.ts            # Auto-imports all providers
    openrouter.ts       # OpenRouter API key provisioning
    supabase.ts         # Supabase project + keys provisioning
  utils/
    env.ts              # .env read/write, gitignore check
    notify.ts           # macOS notifications + waitForUser
    summary.ts          # Pretty-print results table
```

## Adding a Provider

Providers self-register at import time. Create a new file in `src/providers/`:

```typescript
import { Provider, ProviderOpts, ProvisionResult } from "../types.js";
import { registry } from "./registry.js";

const myProvider: Provider = {
  name: "my-service",
  requiredCredentials: ["MY_SERVICE_API_KEY"],

  detect(env) {
    return !!env["MY_SERVICE_API_KEY"];
  },

  async provision(context, opts): Promise<ProvisionResult> {
    const page = await context.newPage();
    // ... browser automation here
    return { vars: { MY_SERVICE_API_KEY: "extracted-key" } };
  },
};

registry.register(myProvider);
```

Then add the import to `src/providers/index.ts`.

## Requirements

- **Node.js** >= 18
- **Python 3.11+** with a `.venv` (for browser-use agent — OpenRouter provider)
- **AgentMail API key** — [console.agentmail.to](https://console.agentmail.to)
- **Anthropic API key** — powers the AI browser agent

## Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repo
2. Create a branch (`git checkout -b my-feature`)
3. Make your changes
4. Run `npx tsc --noEmit` to type-check
5. Commit and open a PR

**Ideas for contributions:**
- New providers (Vercel, Planetscale, Neon, Resend, etc.)
- Better error handling for browser flows
- Headless mode improvements
- Tests

If you want to add a provider, check out `src/providers/openrouter.ts` for an example and the [Adding a Provider](#adding-a-provider) section above.

## License

[MIT](LICENSE)
