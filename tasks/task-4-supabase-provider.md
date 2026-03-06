# Task 4: Supabase Provider

## Tab: Terminal 4

## Prerequisites
Wait for Task 2 to create `src/providers/supabase.ts` as a stub. Then **replace** the stub implementation with the real one below. If the file doesn't exist yet, create it fresh.

## What to build

### `src/providers/supabase.ts` — Supabase Project Setup Provider

Implements the `Provider` interface to automate Supabase project creation and key extraction.

#### `detect(env)`
- Return `true` if ALL of `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` exist and are non-empty

#### `provision(context, opts)`
Full Playwright flow:

1. **Navigate** to `https://supabase.com/dashboard/projects`
2. **Check auth** — if redirected to login, call `waitForUser("Please log in to Supabase in the browser, then press Enter")`
3. **Check existing projects:**
   - Look for a project matching `opts.projectName` (default: `"autoprovision"`)
   - If found, click into it and skip to step 5
   - If not found, continue to create
4. **Create new project:**
   - Click "New Project"
   - Select organization if prompted (use first available)
   - Fill in project name: `opts.projectName || "autoprovision"`
   - Generate a secure DB password (use `crypto.randomBytes(24).toString('base64url')`)
   - Select region (use default or `opts.region`)
   - Select free tier
   - Click "Create new project"
   - **Wait for project to be ready** — poll/watch for the dashboard to load (can take 1-3 min). Show progress in console. Timeout after 5 minutes.
5. **Extract API keys:**
   - Navigate to project Settings > API (URL pattern: `/dashboard/project/{ref}/settings/api`)
   - Extract: Project URL (`SUPABASE_URL`), anon public key (`SUPABASE_ANON_KEY`), service_role key (`SUPABASE_SERVICE_ROLE_KEY`)
   - The service_role key is hidden by default — look for a "Reveal" button
6. **Extract Database URL:**
   - Navigate to Settings > Database (URL pattern: `/dashboard/project/{ref}/settings/database`)
   - Find the connection string / URI
   - `DATABASE_URL` = the connection string (with password filled in if possible)
7. **Return** all 4 vars plus metadata `{ projectId, projectUrl }`

#### Error handling
- If project creation fails (e.g., free tier limit reached: max 2 projects), throw with actionable message: "Supabase free tier limited to 2 projects. Delete one at supabase.com/dashboard or upgrade."
- Timeout on project provisioning: "Project is taking too long. Check supabase.com/dashboard manually."
- Use `page.waitForSelector` / `page.waitForURL` with explicit timeouts

#### `rollback(context)`
- If a project was partially created, log a warning with the dashboard URL. Don't auto-delete — too destructive.

## Important notes
- Import `registry` from `./registry` and self-register
- Import `waitForUser` from `../utils/notify`
- Supabase's dashboard is a React SPA — selectors may need `waitForSelector` with longer timeouts
- Store the generated DB password in the result metadata so the user has it
- Add comments on fragile selectors

## Files to modify
- `src/providers/supabase.ts` (replace stub)

## When done
Run `npx tsc --noEmit`. Then:
```
osascript -e 'display notification "Task 4 complete: Supabase provider" with title "Autoprovision"'
```
