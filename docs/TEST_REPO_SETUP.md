# Test Repo Setup for PR-mon GO

## Test Repo

**URL:** https://github.com/archiso7/prmon-test-arena

A public GitHub repo with dummy source files and 4 open PRs specifically designed for testing and demoing PR-mon GO.

## Configuration

Set these environment variables to point PR-mon GO at the test repo:

```bash
# In your .env file or shell
export GITHUB_TOKEN="your_github_token"
export PRMON_REPO_OWNER="archiso7"
export PRMON_REPO_NAME="prmon-test-arena"
```

Or if using the Go app directly:

```bash
cd prmon-go
GITHUB_TOKEN=your_token PRMON_REPO_OWNER=archiso7 PRMON_REPO_NAME=prmon-test-arena go run .
```

## Open PRs

The test repo has 4 open PRs with real diffs at varying sizes:

| PR # | Title | Branch | Size | Lines Changed | PR-mon Equivalent |
|------|-------|--------|------|---------------|-------------------|
| [#1](https://github.com/archiso7/prmon-test-arena/pull/1) | fix: remove console.log('pls work') | `fix/remove-debug-logs` | Small | ~10 | ⭐ Magikarp |
| [#2](https://github.com/archiso7/prmon-test-arena/pull/2) | feat: add dark mode support across all components | `feature/dark-mode` | Medium | ~260 | ⭐⭐⭐ Haunter |
| [#3](https://github.com/archiso7/prmon-test-arena/pull/3) | hotfix: patch XSS vulnerability in search input | `hotfix/xss-fix` | Small | ~36 | ⭐⭐ Voltorb |
| [#4](https://github.com/archiso7/prmon-test-arena/pull/4) | refactor: rewrite entire ORM layer to use query builder | `refactor/orm-rewrite` | Large | ~1130 | ⭐⭐⭐⭐⭐ Mewtwo |

### PR Details

**PR #1 — Debug Log Cleanup**
- Removes leftover `console.log('pls work')` and other debug statements from `src/app.js`
- Classic "oops I left debug logs in" PR
- Small diff, easy review

**PR #2 — Dark Mode Feature**
- Adds `src/styles.css` (full CSS with light/dark theme variables)
- Adds `src/theme.js` (theme manager with system preference detection)
- Updates `src/config.json` (enables dark mode feature flag)
- Updates `src/app.js` (integrates theme module)
- A real medium-sized feature PR

**PR #3 — XSS Security Fix**
- Rewrites `sanitizeInput()` in `src/utils.js` with proper HTML encoding
- Adds regex patterns to detect script injection, event handlers, javascript: URIs
- Updates `src/app.js` to sanitize search input before processing
- Security hotfix vibes

**PR #4 — ORM Rewrite (The Boss)**
- Adds entire `src/db/` directory with 6 new files:
  - `index.js` — Database class with transactions
  - `query-builder.js` — Fluent SQL builder (SELECT/INSERT/UPDATE/DELETE/UPSERT)
  - `connection-pool.js` — Connection pool manager
  - `schema.js` — Schema builder with column types
  - `migration.js` — Migration runner with up/down
  - `models.js` — Domain models (Trainer, PRmon, Review)
- 1,130 lines of new code
- The legendary PR-mon — bring your Master Ball

## Important Notes

- **Do NOT merge these PRs** — they need to stay open for testing
- The repo is owned by `archiso7` (the GitHub account the `gh` CLI is authenticated as)
- All PRs have real diffs against the `main` branch
- The repo is public so no special auth is needed beyond a basic GitHub token
