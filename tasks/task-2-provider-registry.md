# Task 2: Provider Registry + Base Infrastructure

## Tab: Terminal 2

## What to build

### 1. `src/providers/registry.ts` — Provider Registry
- Export a `ProviderRegistry` class:
  - `register(provider: Provider): void` — add a provider
  - `get(name: string): Provider | undefined` — look up by name
  - `list(): string[]` — list all registered provider names
  - `has(name: string): boolean` — check if registered
- Export a singleton `registry` instance
- Providers self-register by calling `registry.register(...)` when imported

### 2. `src/providers/index.ts` — Auto-registration
- Import all provider modules (supabase, openrouter) so they self-register
- Export the `registry` singleton
- NOTE: The actual provider files (supabase.ts, openrouter.ts) are being built by Tasks 3 and 4. For now, create **stub files** that register with placeholder implementations:
  - `src/providers/supabase.ts` — register a provider with `name: "supabase"`, `requiredCredentials: ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL"]`, and stub `provision()` that throws "not implemented"
  - `src/providers/openrouter.ts` — register a provider with `name: "openrouter"`, `requiredCredentials: ["OPENROUTER_API_KEY"]`, and stub `provision()` that throws "not implemented"
- Tasks 3 and 4 will replace the stub implementations with real ones

### 3. `src/utils/notify.ts` — User notification helper
- Export `waitForUser(message: string): Promise<void>` — print a message to console AND trigger a macOS system notification (`osascript -e 'display notification ...'`), then wait for the user to press Enter in the terminal
- Export `notify(message: string): void` — just send a macOS notification without waiting
- Use `child_process.execSync` for osascript

## Shared types
Import from `../types.ts`.

## Files to create
- `src/providers/registry.ts`
- `src/providers/index.ts`
- `src/providers/supabase.ts` (stub)
- `src/providers/openrouter.ts` (stub)
- `src/utils/notify.ts`

## When done
Run `npx tsc --noEmit` to verify. Then notify:
```
osascript -e 'display notification "Task 2 complete: Registry + Notify" with title "Autoprovision"'
```
