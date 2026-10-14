# Architecture

Source of truth is the PRD, `docs/prds/snack-voting.md`. This file summarises its
technical design. Anything not yet on `main` is labelled **Planned**.

## Overview

A static, mobile-first single page served by Cloudflare Pages, plus Pages Functions
for the JSON API under `/api`, backed by one D1 (SQLite) database (binding `DB`).
No cron and no Worker outside Pages. Free tier only. The admin PIN is a Pages secret
(`ADMIN_PIN`), never committed and never shipped to the browser except as typed by an
admin (kept in session storage).

## Data model

One D1 database, no migrations beyond the initial schema. The "day" is the
Asia/Dhaka calendar date.

- `employees` (id, name unique case-insensitive, active, created_at)
- `snacks` (id, name unique case-insensitive, status: pending | approved | retired,
  suggested_by employee id nullable, created_at)
- `votes` (day date, employee_id, snack_id, updated_at), primary key (day, employee_id)
- `results` (day primary key, status: decided | skipped, winner_snack_id nullable,
  method: votes | tie_random | admin | no_votes, counts snapshot as JSON, decided_at)
- `settings` (single row: open_time, cutoff_time, working_days)

Employees and snacks are never hard-deleted (deactivated or retired), so history
stays consistent. Rejecting a suggestion sets its status to retired.

## API contract

All under `/api`, JSON. Voter endpoints are open; admin endpoints need header
`X-Admin-Pin`. A wrong or missing PIN gives 401; the PIN compare is constant-time.

Voter:

- `GET /state`: today's status (closed | open | decided | skipped), window times,
  approved snacks with counts, the caller's current vote (given `?employee=<id>`),
  and the result if decided. Deciding the day happens here when past cutoff.
- `GET /employees`: active employees for the picker.
- `POST /vote` `{employee_id, snack_id}`: 403 closed, 404 unknown or inactive,
  409 snack not votable.
- `POST /suggestions` `{employee_id, name}`: 409 duplicate, 429 over 3 pending.
- `GET /history`: last 30 decided days.

Admin:

- `GET /admin/suggestions`
- `GET /admin/snacks` (all snacks, any status, with suggester), `POST /admin/snacks`
  (add), `PATCH /admin/snacks/:id` (rename, approve, reject, retire)
- `GET /admin/employees` (all, including inactive), `POST /admin/employees`
  (bulk `{names[]}` or one), `PATCH /admin/employees/:id`
- `GET /admin/settings`, `PUT /admin/settings`
- `POST /admin/days/:day/skip`, `POST /admin/days/:day/override` `{snack_id}`

Errors are `{ "error": { "code", "message" } }` (see `functions/_lib/http.ts`).

## Day lifecycle and lazy decision

A day is Closed, then Open from the opening time on a working day, then either
Decided (first load after cutoff) or Skipped (admin skips the day). Decided is
written once and then frozen; an admin may override the winner afterwards.

The day is decided lazily by the first `GET /state` after cutoff, using an
insert-if-absent on `results`, so concurrent callers converge on one row. The random
tie pick happens inside that insert, so it is stored before anyone sees it. Zero votes
gives no winner (`no_votes`) and the admin chooses. Open and cutoff are judged on the
server clock in Asia/Dhaka, never the browser's. One vote per employee per day is
enforced by the `votes` primary key.

## Frontend

A static single page in `public/`: name picker, snack list with counts and a vote
button, suggestion form, history list, and an admin page behind the PIN prompt.
States: loading, error with retry, closed, open, decided, skipped, no snacks. Counts
refresh by polling every 15 seconds while open; no websockets. Votes are never
returned per person.

## Built vs Planned

Built (on `main`):

- `functions/_lib/env.ts` (`Env` type: `DB`, `ADMIN_PIN`) and `functions/_lib/http.ts`
  (`json`, `error`, `readJsonObject`).
- Frontend modules in `public/js/`: `api.js`, `identity.js`, `views/` (vote, suggest,
  history), `admin/` (main, pin, menu, employees, controls), and `public/admin.html`.
- `wrangler.toml` (Pages project, D1 binding `DB`, placeholder `database_id`).
- Tests in `test/backend` and `test/frontend` (Vitest).

Planned:

- D1 schema and `migrations/` (schema issue #3).
- All `/api` endpoints listed above (no handlers under `functions/api/` yet).
- The voter page `public/index.html` (only `public/admin.html` exists).
- Push-to-deploy workflow and CI (FR-14).
