# Snack Voting — task list

- Source PRD: `docs/prds/snack-voting.md` (status `Approved`; every decision lives there, none here)
- Epic: #1
- Date: 2026-10-15
- Repo: masnun-siam/snack-voting

Greenfield repo (no `CLAUDE.md`, no code): every file below is `(new)` unless stated. Layout: `functions/` (Pages Functions, `backend`), `migrations/` (`backend`), `public/` (static site, `frontend`), `test/backend` and `test/frontend`. Tooling choices (TypeScript, Vitest with the workers pool, plain JS modules for the browser, no framework) follow the PRD's "static single page + Pages Functions + D1" and add no design.

## Shared files

- `functions/_lib/*.ts` — each created by one task (3: `time.ts`, 4: `env.ts`/`http.ts`, 5: `auth.ts`, 7: `day.ts`, 9: `counts.ts`/`decide.ts`) and only imported afterwards; no later task edits them.
- `public/js/views/{vote,suggest,history}.js` — stubs owned by task 19, then replaced by exactly one of tasks 21, 22, 23; `public/js/admin/{menu,employees,controls}.js` — stubs owned by task 24, replaced by tasks 26, 27, 28. The dependency on the stub task orders them.
- `public/js/api.js`, `public/js/identity.js` — owned by task 18; read-only for the rest.


## Waves

- Wave 1 (can start now): backend task 1
- Wave 2 (after wave 1 is merged): backend task 2, backend task 3, backend task 4, frontend task 18, frontend task 19, frontend task 24
- Wave 3 (after wave 2 is merged): backend task 5, backend task 6, backend task 7, backend task 11, backend task 12, backend task 13, backend task 14, backend task 15, backend task 16, frontend task 20, frontend task 25
- Wave 4 (after wave 3 is merged): backend task 8, backend task 9, backend task 17, frontend task 21, frontend task 22, frontend task 23, frontend task 26, frontend task 27, frontend task 28
- Wave 5 (after wave 4 is merged): backend task 10

## Task 1 — Project scaffold
Outcome: A Cloudflare Pages + D1 TypeScript project that installs and runs an (empty) test suite.
Area: backend
Files/symbols: `package.json` (new: wrangler, typescript, vitest, @cloudflare/vitest-pool-workers, @cloudflare/workers-types, jsdom; scripts `test`, `dev`), `wrangler.toml` (new: Pages project `snack-voting`, `pages_build_output_dir = public`, D1 binding `DB`), `vitest.config.ts` (new: two projects, `backend` on the workers pool using `wrangler.toml` bindings and `test/backend/**`, `frontend` on jsdom with `test/frontend/**`). The only task that adds dependencies.
Acceptance criteria:
- `npm install` succeeds and `npm test` exits 0 with no test files.
- A throwaway test under `test/backend/` can read `env.DB`, and one under `test/frontend/` can use `document`.
- No secret or PIN value is committed; `wrangler.toml` documents `ADMIN_PIN` as a secret set outside the repo.
Verify command: `npm test`
Depends on: none
Parallel: yes
Issue: #2

## Task 2 — Schema and migration
Outcome: The D1 schema from the PRD exists and is applied to the test database.
Area: backend
Files/symbols: `migrations/0001_init.sql` (new): `employees`, `snacks`, `votes` (PK `day, employee_id`), `results` (PK `day`), `settings` (single row, seeded 09:00, 14:00, Mon-Fri); `test/backend/setup.ts` (new, not counted: applies migrations before tests).
Acceptance criteria:
- Inserting two employees or two snacks whose names differ only by case fails (unique, case-insensitive); employee names and snack names are unique independently.
- A second vote row for the same `(day, employee_id)` is rejected by the primary key; a second `results` row for the same `day` is rejected.
- `snacks.status` accepts only pending, approved, retired; `results.status` only decided, skipped; `results.method` only votes, tie_random, admin, no_votes; `settings` holds exactly one seeded row (open 09:00, cutoff 14:00, Monday to Friday).
Verify command: `npx vitest run --project backend test/backend/schema.test.ts`
Depends on: task 1
Parallel: yes
Issue: #3

## Task 3 — Time and window logic
Outcome: Pure functions decide the Asia/Dhaka day and whether voting is before opening, open or after cutoff.
Area: backend
Files/symbols: `functions/_lib/time.ts` (new): `dhakaDay(now)`, `dayWindowStatus(settings, now)` returning `not_working_day | before_open | open | after_cutoff`, `isValidWindow(open, cutoff)`, time-string parsing. No DB access.
Acceptance criteria:
- The Dhaka calendar date is used even when the UTC date differs (e.g. 19:00 UTC is already the next Dhaka day).
- 09:00 and 14:00 default boundaries: open from opening time inclusive, closed from cutoff inclusive; a non-working weekday is `not_working_day`.
- `isValidWindow` rejects a cutoff that is not later than opening and malformed times (FR-11).
Verify command: `npx vitest run --project backend test/backend/time.test.ts`
Depends on: task 1
Parallel: yes
Issue: #4

## Task 4 — Env type and HTTP helpers
Outcome: Shared typed environment and JSON response helpers every endpoint uses.
Area: backend
Files/symbols: `tsconfig.json` (new, with workers types), `functions/_lib/env.ts` (new: `Env { DB; ADMIN_PIN }`), `functions/_lib/http.ts` (new: `json(data, status)`, `error(status, code, message)`, JSON body parsing that returns 400 on invalid JSON).
Acceptance criteria:
- `error` responses are JSON `{error: {code, message}}` with the given status.
- Invalid or non-object JSON bodies yield a 400 JSON error rather than a thrown exception.
- `npx tsc --noEmit` passes.
Verify command: `npx tsc --noEmit && npx vitest run --project backend test/backend/http.test.ts`
Depends on: task 1
Parallel: yes
Issue: #5

## Task 5 — Admin PIN middleware
Outcome: Every `/api/admin/*` request needs a valid `X-Admin-Pin` header.
Area: backend
Files/symbols: `functions/_lib/auth.ts` (new: constant-time `pinMatches(given, secret)`), `functions/api/admin/_middleware.ts` (new: Pages middleware, 401 on missing or wrong PIN, `next()` otherwise). Precedent: Pages Functions `_middleware.ts` convention.
Acceptance criteria:
- Missing, empty or wrong `X-Admin-Pin` returns 401 with a JSON error and never reaches the route.
- The correct PIN passes through; comparison is constant-time (no early exit on first differing byte; different lengths do not throw).
- The PIN is read only from `env.ADMIN_PIN`; an unset secret rejects every request (fail closed).
Verify command: `npx vitest run --project backend test/backend/auth.test.ts`
Depends on: task 4
Parallel: yes
Issue: #6

## Task 6 — Voter employee list
Outcome: `GET /api/employees` lists active employees for the picker.
Area: backend
Files/symbols: `functions/api/employees.ts` (new, `onRequestGet`).
Acceptance criteria:
- Returns `{id, name}` for active employees only, sorted by name; deactivated employees are absent (FR-1, FR-8).
- The response contains no vote data.
- An empty table returns `[]` with 200.
Verify command: `npx vitest run --project backend test/backend/employees.test.ts`
Depends on: task 2, task 4
Parallel: yes
Issue: #7

## Task 7 — Day state helper
Outcome: One shared helper loads settings and reports today's lifecycle state without deciding the day.
Area: backend
Files/symbols: `functions/_lib/day.ts` (new): `getSettings(db)`, `getDayState(db, now)` returning `{day, status: closed | open | decided | skipped, window, result}` built from `time.ts` and the `results` row.
Acceptance criteria:
- A day with a `results` row of status skipped reports `skipped`; one with status decided reports `decided` and includes the stored result.
- With no row, the status follows the window: `open` inside the window, `closed` before opening, on a non-working day, or after cutoff (undecided).
- Changing `settings.cutoff_time` changes the status of the current day immediately (FR-11); nothing is written to the DB.
Verify command: `npx vitest run --project backend test/backend/day.test.ts`
Depends on: task 2, task 3
Parallel: yes
Issue: #8

## Task 8 — Cast or change a vote
Outcome: `POST /api/vote` records one vote per employee per day and lets them change it until cutoff.
Area: backend
Files/symbols: `functions/api/vote.ts` (new, `onRequestPost`; uses `getDayState` from `_lib/day.ts` and `http.ts`).
Acceptance criteria:
- Outside the open window, or on a skipped or decided day, returns 403 with a clear message naming opening or cutoff time (FR-2).
- Unknown or inactive employee returns 404; snack that is not approved (pending, retired, unknown) returns 409 (FR-3).
- Voting twice leaves exactly one `votes` row holding the latest snack, via upsert on `(day, employee_id)`; two concurrent requests never produce two rows.
Verify command: `npx vitest run --project backend test/backend/vote.test.ts`
Depends on: task 4, task 7
Parallel: yes
Issue: #9

## Task 9 — Decide the day
Outcome: A function decides and stores the day's result once, converging under concurrent callers.
Area: backend
Files/symbols: `functions/_lib/counts.ts` (new: `countVotes(db, day)` returning per-snack counts, never voter ids), `functions/_lib/decide.ts` (new: `decideDay(db, day)` insert-if-absent into `results`, tie random pick done inside the insert, counts snapshot as JSON).
Acceptance criteria:
- Most votes wins with method `votes`; a tie stores method `tie_random` and one of the tied snacks; zero votes stores method `no_votes` with a null winner (FR-5).
- Calling `decideDay` twice, or concurrently, leaves one `results` row and returns the same winner both times; the stored result never changes on later calls.
- A day already `skipped` is never overwritten; votes by an employee deactivated mid-day are still counted.
Verify command: `npx vitest run --project backend test/backend/decide.test.ts`
Depends on: task 7
Parallel: yes
Issue: #10

## Task 10 — Voter state endpoint
Outcome: `GET /api/state` returns today's status, snacks with counts, the caller's vote and the result, deciding the day after cutoff.
Area: backend
Files/symbols: `functions/api/state.ts` (new, `onRequestGet`; composes `getDayState`, `countVotes`, `decideDay`).
Acceptance criteria:
- Returns status, window times, approved snacks with counts and the current leader, and the caller's vote when given `?employee=<id>`; no response field lists voter names against snacks (FR-4).
- The first call after cutoff stores the result via `decideDay` and returns it; later calls return the identical result, including `method` (FR-5).
- Returns flags for empty states: no approved snacks, no active employees; a skipped day returns status `skipped`.
Verify command: `npx vitest run --project backend test/backend/state.test.ts`
Depends on: task 4, task 7, task 9
Parallel: yes
Issue: #11

## Task 11 — Suggest a snack
Outcome: `POST /api/suggestions` lets an employee propose a snack as pending.
Area: backend
Files/symbols: `functions/api/suggestions.ts` (new, `onRequestPost`).
Acceptance criteria:
- Name is trimmed and must be 1-60 characters, else 400; the snack is stored `pending` with `suggested_by`, and is not votable (FR-6).
- A name matching any existing snack or pending suggestion case-insensitively returns 409.
- A fourth pending suggestion from the same employee returns 429; unknown or inactive employee returns 404.
Verify command: `npx vitest run --project backend test/backend/suggestions.test.ts`
Depends on: task 2, task 4
Parallel: yes
Issue: #12

## Task 12 — History endpoint
Outcome: `GET /api/history` lists the last 30 decided days.
Area: backend
Files/symbols: `functions/api/history.ts` (new, `onRequestGet`).
Acceptance criteria:
- Returns at most 30 most recent days with a `results` row, newest first: date, winner name (null if none), counts per snack from the stored snapshot, and method (votes, tie_random, admin, no_votes, skipped) (FR-12).
- Days still open or undecided are not listed; retired snacks and deactivated employees do not change old rows.
- No field contains a voter name or id.
Verify command: `npx vitest run --project backend test/backend/history.test.ts`
Depends on: task 2, task 4
Parallel: yes
Issue: #13

## Task 13 — Admin snack list and add
Outcome: Admins can list all snacks, see pending suggestions and add an approved snack directly.
Area: backend
Files/symbols: `functions/api/admin/suggestions.ts` (new, GET pending with suggester name), `functions/api/admin/snacks/index.ts` (new, GET all statuses, POST add).
Acceptance criteria:
- `GET /admin/suggestions` returns only pending snacks with the suggesting employee's name; `GET /admin/snacks` returns every snack with its status.
- `POST /admin/snacks {name}` creates an `approved` snack that is immediately votable; name 1-60 characters trimmed, case-insensitive duplicate returns 409 (FR-7).
- Invalid body returns 400.
Verify command: `npx vitest run --project backend test/backend/admin-snacks-list.test.ts`
Depends on: task 2, task 4
Parallel: yes
Issue: #14

## Task 14 — Admin snack update
Outcome: `PATCH /api/admin/snacks/:id` renames, approves, rejects and retires snacks.
Area: backend
Files/symbols: `functions/api/admin/snacks/[id].ts` (new, `onRequestPatch`).
Acceptance criteria:
- Approve sets pending to approved (appears in `/state` at once); reject and retire both set `retired`; unknown id returns 404 (FR-7; reject = retire per the PRD decision).
- Rename trims, enforces 1-60 characters and case-insensitive uniqueness (409).
- A retired snack stays in the table, remains in past results and `/history`, and is rejected by `/vote` (409); a retired snack cannot be re-approved except by explicit approve.
Verify command: `npx vitest run --project backend test/backend/admin-snack-update.test.ts`
Depends on: task 2, task 4
Parallel: yes
Issue: #15

## Task 15 — Admin employees API
Outcome: Admins can list, bulk-add, rename and deactivate employees.
Area: backend
Files/symbols: `functions/api/admin/employees/index.ts` (new, GET all including inactive, POST bulk `{names[]}` or one `{name}`), `functions/api/admin/employees/[id].ts` (new, `onRequestPatch`: rename, active flag).
Acceptance criteria:
- Bulk add trims lines, skips blanks and names that exist case-insensitively, creates the rest, and returns created and skipped counts (FR-8).
- Names are 1-60 characters and unique case-insensitively on add and rename (409 on rename clash).
- Deactivating sets `active = 0` without deleting; their past votes still count in `/history` and existing results; they disappear from `GET /employees`.
Verify command: `npx vitest run --project backend test/backend/admin-employees.test.ts`
Depends on: task 2, task 4
Parallel: yes
Issue: #16

## Task 16 — Admin settings API
Outcome: Admins can read and change the voting window and working weekdays.
Area: backend
Files/symbols: `functions/api/admin/settings.ts` (new, `onRequestGet`, `onRequestPut`; uses `isValidWindow` from `_lib/time.ts`).
Acceptance criteria:
- `PUT` stores open time, cutoff time and working weekdays; a cutoff not later than the opening time returns 400 (FR-11).
- Weekdays must be a non-empty set of valid days; malformed times return 400.
- After changing the cutoff, `getDayState` for a still-open current day reflects the new cutoff immediately.
Verify command: `npx vitest run --project backend test/backend/admin-settings.test.ts`
Depends on: task 2, task 3, task 4
Parallel: yes
Issue: #17

## Task 17 — Admin day skip and override
Outcome: Admins can skip a day before cutoff and override a decided winner.
Area: backend
Files/symbols: `functions/api/admin/days/[day]/skip.ts` (new, POST), `functions/api/admin/days/[day]/override.ts` (new, POST `{snack_id}`).
Acceptance criteria:
- Skip before cutoff writes a `skipped` result; after it, `/vote` rejects and `/state` reports skipped; skipping an already-decided, skipped or past-cutoff day returns 409 (FR-10).
- Override on a decided day replaces the winner with any existing snack, sets method `admin`, and later `/state` and `/history` show it as set by admin; unknown snack returns 404.
- Override on an undecided or skipped day returns 409; `day` must be `YYYY-MM-DD` (400 otherwise).
Verify command: `npx vitest run --project backend test/backend/admin-days.test.ts`
Depends on: task 2, task 3, task 4, task 7
Parallel: yes
Issue: #18

## Task 18 — Frontend API client and identity
Outcome: Browser modules wrap the API and remember the chosen employee.
Area: frontend
Files/symbols: `public/js/api.js` (new: `getState`, `getEmployees`, `postVote`, `postSuggestion`, `getHistory`, admin calls sending `X-Admin-Pin`; errors carry status and message), `public/js/identity.js` (new: get, set, clear employee id in `localStorage`; admin PIN in `sessionStorage`).
Acceptance criteria:
- `getState` appends `?employee=<id>` when an employee is set; non-2xx responses reject with the server message (tests mock `fetch` against the PRD contract).
- The chosen employee survives a fresh module load (reload) and `clear()` removes it (FR-1).
- The admin PIN lives only in `sessionStorage` and is sent as `X-Admin-Pin`; it is never written to `localStorage`.
Verify command: `npx vitest run --project frontend test/frontend/api.test.ts`
Depends on: task 1
Parallel: yes
Issue: #19

## Task 19 — Voter view contract and stubs
Outcome: Voter view modules exist with a fixed `mount(el, ctx)` contract so view tasks edit separate files.
Area: frontend
Files/symbols: `public/js/views/vote.js`, `public/js/views/suggest.js`, `public/js/views/history.js` (all new: each exports `mount(el, ctx)` and `update(state)` rendering a placeholder; `ctx` carries employee, state and api).
Acceptance criteria:
- Each module exports `mount` and `update` and renders a placeholder without throwing in jsdom.
- Contract is documented in a comment at the top of each file: `ctx = {employee, state, api, refresh}`.
Verify command: `npx vitest run --project frontend test/frontend/stubs.test.ts`
Depends on: task 1
Parallel: yes
Issue: #20

## Task 20 — Page shell and name picker
Outcome: The voter page loads state, shows the name picker and mounts the views with polling and error handling.
Area: frontend
Files/symbols: `public/index.html` (new: mobile-first layout, inline CSS, sections for picker, vote, suggest, history), `public/js/main.js` (new: boot, loading and error-with-retry states, 15 s polling while open, mounts views), `public/js/views/picker.js` (new).
Acceptance criteria:
- Picker lists active employees; picking one stores it and a reload keeps it selected; a "not you?" control clears it and shows the list again (FR-1).
- Loading and error states render, the error state has a working Retry; no employees shows a message telling admins to add some.
- State refreshes every 15 seconds only while status is `open`, and stops otherwise (FR-4).
Verify command: `npx vitest run --project frontend test/frontend/shell.test.ts`
Depends on: task 18, task 19
Parallel: yes
Issue: #21

## Task 21 — Vote view
Outcome: The vote view shows the day's status, snacks with counts and lets the user vote.
Area: frontend
Files/symbols: `public/js/views/vote.js` (replaces the stub).
Acceptance criteria:
- Shows "opens at HH:MM", "open until HH:MM", "closed" or "no snacks today" per state; a skipped day shows no vote buttons (FR-2, FR-10).
- Open: lists each approved snack with its count, marks the leader and the user's current vote, and a vote button posts and refreshes; a rejected vote shows the server message (FR-3, FR-4).
- Decided: shows the winner, with "random pick among tied snacks", "no votes, admin's choice" or "set by admin" as the method says (FR-5, FR-10); no approved snacks shows that voting is not possible and points admins to the menu.
Verify command: `npx vitest run --project frontend test/frontend/vote-view.test.ts`
Depends on: task 20
Parallel: yes
Issue: #22

## Task 22 — Suggest view
Outcome: The suggest view lets an employee propose a snack.
Area: frontend
Files/symbols: `public/js/views/suggest.js` (replaces the stub).
Acceptance criteria:
- Submitting a trimmed name of 1-60 characters posts a suggestion and shows it was sent pending (FR-6).
- Duplicate (409) and over-limit (429) responses show their server messages; empty or over-length input is blocked client-side.
- The form is hidden until an employee is picked.
Verify command: `npx vitest run --project frontend test/frontend/suggest-view.test.ts`
Depends on: task 20
Parallel: yes
Issue: #23

## Task 23 — History view
Outcome: The history view lists the last 30 decided days.
Area: frontend
Files/symbols: `public/js/views/history.js` (replaces the stub).
Acceptance criteria:
- Lists each day with date, winner, counts per snack and how it was decided (votes, random tie pick, admin override, no votes, skipped) (FR-12).
- Shows an empty message when there are no decided days, and an error with retry on failure.
- No voter names are rendered.
Verify command: `npx vitest run --project frontend test/frontend/history-view.test.ts`
Depends on: task 20
Parallel: yes
Issue: #24

## Task 24 — Admin view contract and stubs
Outcome: Admin section modules exist with a fixed `mount(el, ctx)` contract.
Area: frontend
Files/symbols: `public/js/admin/menu.js`, `public/js/admin/employees.js`, `public/js/admin/controls.js` (all new: placeholder `mount(el, ctx)`, `ctx = {api}`).
Acceptance criteria:
- Each module exports `mount` and renders a placeholder in jsdom without throwing.
- The `ctx` contract is documented at the top of each file.
Verify command: `npx vitest run --project frontend test/frontend/admin-stubs.test.ts`
Depends on: task 1
Parallel: yes
Issue: #25

## Task 25 — Admin shell and PIN prompt
Outcome: The admin page asks for the PIN and mounts the admin sections.
Area: frontend
Files/symbols: `public/admin.html` (new, inline CSS), `public/js/admin/main.js` (new: mounts sections after PIN accepted), `public/js/admin/pin.js` (new: PIN prompt, stores in session storage via `identity.js`).
Acceptance criteria:
- With no PIN stored the sections are hidden and a PIN prompt shows; a PIN rejected with 401 clears it and shows an error (FR-9).
- Reloading in the same tab keeps access (session storage); a new tab asks again.
- The PIN never appears in any served file or source.
Verify command: `npx vitest run --project frontend test/frontend/admin-shell.test.ts`
Depends on: task 18, task 24
Parallel: yes
Issue: #26

## Task 26 — Admin menu view
Outcome: Admins manage suggestions and the menu from the admin page.
Area: frontend
Files/symbols: `public/js/admin/menu.js` (replaces the stub).
Acceptance criteria:
- Lists pending suggestions with approve and reject buttons, and all snacks with rename and retire; an added or approved snack shows as approved at once (FR-7).
- An add form posts a new snack; duplicate or invalid input shows the server message.
- Retired snacks are shown as retired, not removed.
Verify command: `npx vitest run --project frontend test/frontend/admin-menu.test.ts`
Depends on: task 25
Parallel: yes
Issue: #27

## Task 27 — Admin employees view
Outcome: Admins manage the employee list from the admin page.
Area: frontend
Files/symbols: `public/js/admin/employees.js` (replaces the stub).
Acceptance criteria:
- A textarea accepts one name per line and posts them; shows how many were created and how many skipped (FR-8).
- Lists all employees including inactive, with rename and deactivate/reactivate.
- Name conflicts show the server message.
Verify command: `npx vitest run --project frontend test/frontend/admin-employees.test.ts`
Depends on: task 25
Parallel: yes
Issue: #28

## Task 28 — Admin settings and day controls view
Outcome: Admins edit the voting window and control today's day from the admin page.
Area: frontend
Files/symbols: `public/js/admin/controls.js` (replaces the stub).
Acceptance criteria:
- Shows current open time, cutoff and weekdays and saves changes; a cutoff not after opening shows the server error (FR-11).
- Before cutoff, a Skip day button posts the skip; after the result, an Override winner picker posts the chosen snack and the day then shows as set by admin (FR-10).
- Skip is hidden once the day is decided or skipped; override only appears for a decided day.
Verify command: `npx vitest run --project frontend test/frontend/admin-controls.test.ts`
Depends on: task 25
Parallel: yes
Issue: #29
