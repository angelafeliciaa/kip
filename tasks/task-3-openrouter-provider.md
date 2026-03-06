# Task 3: OpenRouter Provider

## Tab: Terminal 3

## Prerequisites
Wait for Task 2 to create `src/providers/openrouter.ts` as a stub. Then **replace** the stub implementation with the real one below. If the file doesn't exist yet, create it fresh.

## What to build

### `src/providers/openrouter.ts` — OpenRouter API Key Provider

Implements the `Provider` interface to automate getting an OpenRouter API key.

#### `detect(env)`
- Return `true` if `OPENROUTER_API_KEY` exists and is non-empty in env

#### `provision(context, opts)`
Full Playwright flow:

1. **Navigate** to `https://openrouter.ai/settings/keys`
2. **Check auth state** — if redirected to login/signup, call `waitForUser("Please log in to OpenRouter in the browser, then press Enter")`
   - After user presses Enter, verify we're on the keys page. If not, prompt again.
3. **Create a new key:**
   - Look for a "Create Key" button and click it
   - A modal/form should appear — fill in the name field with `autoprovision-{timestamp}`
   - Submit the form
4. **Extract the key:**
   - After creation, the key is typically shown once in a modal/toast
   - Grab the key value (starts with `sk-or-`)
   - If key isn't visible, look for it in a table/list of keys
5. **Return** `{ vars: { OPENROUTER_API_KEY: "<key>" } }`

#### Error handling
- If no "Create Key" button found within 10s, throw with helpful message
- If key extraction fails, throw with "Could not extract API key"
- Use `page.waitForSelector` with timeouts, not arbitrary sleeps

#### `validate(env)` (optional)
- Hit `https://openrouter.ai/api/v1/models` with the key as Bearer token
- Return true if 200, false otherwise

## Important notes
- Import `registry` from `./registry` and call `registry.register(openrouterProvider)` at module level
- Import `waitForUser` from `../utils/notify` for prompting
- Selectors WILL need adjusting based on OpenRouter's actual DOM. Use data attributes or ARIA roles where possible. Add comments noting which selectors may be fragile.
- The browser is **headed** — user can see and interact

## Files to modify
- `src/providers/openrouter.ts` (replace stub)

## When done
Run `npx tsc --noEmit`. Then:
```
osascript -e 'display notification "Task 3 complete: OpenRouter provider" with title "Autoprovision"'
```
