# Git Conventions

## Branch Naming

Use descriptive kebab-case branches:

```
{type}/{kebab-description}
```

Examples:
```
feat/add-vercel-provider
fix/env-write-race-condition
docs/update-contributing-guide
```

## Commit Format

Conventional Commits: `type(scope): subject`

```
feat(providers): add vercel api key provisioning
```

- **Subject line** — one line, present tense, imperative mood ("add" not "added")
- **Lowercase** after the colon — no capital letter
- **No period** at the end
- **50 chars max** for the subject (the part after `type(scope): `)
- **Body is optional** — one additional line max. Two lines total, never more.
- **No `Co-Authored-By` trailers** — no AI attribution lines in commits

### Commit Types

| Type | When to use |
|---|---|
| `feat` | New functionality, new behavior |
| `fix` | Bug fix |
| `refactor` | Code change that doesn't fix a bug or add a feature |
| `docs` | Documentation only |
| `test` | Adding or updating tests |
| `chore` | Maintenance, deps, config — no production code change |
| `style` | Formatting, whitespace, linting — no logic change |
| `ci` | CI/CD changes |
| `perf` | Performance improvement |
| `build` | Build system or external dependency changes |

### Scopes

Scope is **optional**. Omit it for changes that span multiple areas.

| Scope | Area |
|---|---|
| `providers` | Provider implementations (openrouter, supabase, etc.) |
| `browser` | Playwright browser automation |
| `cli` | CLI entrypoint, commander options |
| `env` | .env read/write, gitignore utilities |
| `auth` | Email verification, AgentMail |
| `ci` | CI/CD, GitHub Actions |
| `pkg` | Package dependencies, version bumps |
| `config` | Configuration |

## PR Titles

```
{Short informative title}
```

- **Sentence case**
- **Under 70 characters**
- **Describe the change**

Examples:
```
Add Vercel provider
Fix race condition in atomic .env writes
Support headless mode for CI environments
```
