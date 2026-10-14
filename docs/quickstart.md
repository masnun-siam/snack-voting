# Quickstart

Takes a fresh clone to a running local site and a passing test suite.

## Prerequisites

- Node.js (current LTS)
- npm (ships with Node)

## Install

```bash
npm ci
```

## Run the site locally

```bash
npm run dev
```

This runs `wrangler pages dev public` and serves the site at the URL Wrangler prints (usually http://localhost:8788). Stop it with Ctrl+C.

## Set the admin PIN

The admin PIN is a secret. Never commit it. Create a `.dev.vars` file in the repo root (it is git-ignored) and put your own value in it:

```
ADMIN_PIN=<choose-a-pin>
```

Replace `<choose-a-pin>` with a PIN of your choosing, then restart `npm run dev`. For production, secrets are set outside the repo; see the deploy guide (Planned).

## Run the tests

```bash
npm test
```

This runs `vitest run`. It should finish with all tests passing.

## Local database (Planned)

Planned: applying local D1 migrations. There is no `migrations/` directory yet; the schema arrives in issue #3. Once it merges, this section will list the exact Wrangler command to apply the migrations to the local `snack-voting` database (binding `DB`).
