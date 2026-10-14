# Deploy guide

How to set up Cloudflare and the repo secrets so the deploy workflow
(`.github/workflows/deploy.yml`) can ship Snack Voting. Do this once; after that,
every push to `main` deploys.

No secret value belongs in this repo or in this page. Only secret names appear below.

## Prerequisites

- A Cloudflare account with Pages and D1 available.
- Admin access to the GitHub repository (to add Actions secrets).
- Node.js 22 and `npm ci` run locally, so `npx wrangler` is the repo's pinned Wrangler 4.
- `npx wrangler login` completed for the account you are deploying to.

## Create the Pages project `snack-voting`

The project name must be `snack-voting`; it matches `name` in `wrangler.toml` and
`--project-name` in the workflow.

```bash
npx wrangler pages project create snack-voting --production-branch main
```

Or create it in the Cloudflare dashboard under Workers & Pages, as a Direct Upload
project named `snack-voting`. Do not connect it to Git; GitHub Actions does the deploy.

## Create the D1 database and replace the placeholder id in `wrangler.toml`

```bash
npx wrangler d1 create snack-voting
```

Wrangler prints the new database's `database_id`. Open `wrangler.toml` and replace the
placeholder on line 9:

```toml
database_id = "00000000-0000-0000-0000-000000000000"
```

with the printed id. Keep `binding = "DB"` and `database_name = "snack-voting"`.
Commit the change: database ids are not secret.

## Set `ADMIN_PIN`

`ADMIN_PIN` is a Pages secret, set once by hand. It never appears in the workflow or in
the repo.

```bash
npx wrangler pages secret put ADMIN_PIN --project-name snack-voting
```

Wrangler prompts for the value. For local development put it in the git-ignored
`.dev.vars` instead.

## Repo secrets

In GitHub, go to Settings, Secrets and variables, Actions, and add two repository secrets:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | A Cloudflare API token with the minimum scopes below |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account id (dashboard, Workers & Pages overview) |

### Token minimum scopes

Create the token at Cloudflare dashboard, My Profile, API Tokens, with only:

- Account, Cloudflare Pages: Edit
- Account, D1: Edit

Scope it to the one account. Nothing else is needed.

## What the workflow does

`.github/workflows/deploy.yml` has two jobs.

- **test** runs on every push to `main` and on every pull request: `npm ci`, then
  `npm test`.
- **deploy** runs only on a push to `main`, and only after `test` passes. It runs
  `npm ci`, then:
  1. `npx wrangler d1 migrations apply snack-voting --remote` applies pending D1
     migrations.
  2. `npx wrangler pages deploy public --project-name snack-voting` publishes the site
     and Functions.

Migrations run before the deploy, so a failed migration stops the deploy. Pull requests
run tests only: there are no PR preview deployments.

## First deploy checklist

- [ ] Pages project `snack-voting` exists.
- [ ] D1 database `snack-voting` exists and its id replaced the placeholder in
      `wrangler.toml` (committed).
- [ ] `ADMIN_PIN` is set with `wrangler pages secret put`.
- [ ] `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set as repo secrets, and the
      token has only Pages Edit and D1 Edit.
- [ ] Merge to `main` and watch the Deploy workflow: test, migrations, then Pages deploy
      all green.
