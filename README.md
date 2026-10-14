# Snack Voting

A small website the whole office opens each working day. Every employee picks their name, votes for the snack they want that evening, and the snack with the most votes wins and is the one bought. Employees can also suggest new snacks; admins approve them and run the menu.

## Features

Built (on `main`):
- Vote, suggest and history view modules (`public/js/views/`).
- Admin page (`public/admin.html`) with PIN prompt, menu, employees and day controls sections (`public/js/admin/`).
- Shared API client, identity helper, and Pages Functions helpers for env and JSON responses (`public/js/`, `functions/_lib/`).

Planned:
- Voter home page (`public/index.html`) wiring the views together.
- The `/api` Pages Functions endpoints (voter and admin).
- The D1 schema and migrations.
- Automatic daily decision at cutoff, with tie-break and admin override.
- Deploy workflow to Cloudflare Pages.

## Documentation

- [Quickstart](docs/quickstart.md): clone to a running local site and passing tests.
- [Deploy guide](docs/deploy.md): publish to Cloudflare Pages.
- [Architecture](docs/architecture.md): data model, API contract, day lifecycle.
- [Contributing](CONTRIBUTING.md): how to propose and make changes.
- [License](LICENSE): MIT.

## Product requirements

The product requirements live in [docs/prds/](docs/prds/).

## License

Released under the [MIT License](LICENSE).
