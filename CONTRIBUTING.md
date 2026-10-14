# Contributing

## Setup

```sh
npm install
npm run dev
```

`npm run dev` serves `public/` with the Pages Functions locally via wrangler.

## Running tests

```sh
npm test
```

Vitest runs two projects (see `vitest.config.ts`):

- `backend`: `test/backend/**/*.test.ts`, in the Workers runtime.
- `frontend`: `test/frontend/**/*.test.ts`, in jsdom.

## Type-checking

```sh
npx tsc --noEmit
```

## Test-first expectation

Write a failing test that captures the behaviour first, then the code that makes
it pass. Put tests in `test/backend` or `test/frontend`.

## Branches and pull requests

- Branch off `main`.
- One pull request per issue.
- CI runs tests on pull requests: **Planned**. Until then, run `npm test` and
  `npx tsc --noEmit` locally before opening a PR.
