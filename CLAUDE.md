# CLAUDE.md

Snack Voting: static page plus Cloudflare Pages Functions and D1. See
`docs/architecture.md` for the design.

## Layout

- `functions/`: Pages Functions (TypeScript). Today only `functions/_lib/`
  (`env.ts`, `http.ts`); `functions/api/` handlers are Planned.
- `migrations/`: D1 schema. Planned until schema issue #3 merges.
- `public/`: static frontend (`admin.html`, `js/`). `public/index.html` is Planned.
- `test/backend/`: Vitest in the Workers runtime.
- `test/frontend/`: Vitest in jsdom.
- `docs/prds/snack-voting.md`, `docs/tasks/snack-voting.md`, `docs/architecture.md`.
- `wrangler.toml`: Pages project and D1 binding `DB`.

## Commands

- `npm test`: run all tests (`vitest run`).
- `npx tsc --noEmit`: type-check `functions` and `test`.
- `npm run dev`: `wrangler pages dev public`.

## Source of truth

`docs/prds/snack-voting.md` is the source of truth. A decision not written there has
not been made. Label anything not yet built as "Planned" in docs.

## Rules

- Never commit secrets: `ADMIN_PIN` is set with `wrangler pages secret put ADMIN_PIN`;
  local values live in the git-ignored `.dev.vars`.
- Tests first: write a failing test in `test/backend` or `test/frontend`, then the code.
- Branch off `main`, one pull request per issue.
- Employees and snacks are never hard-deleted.
