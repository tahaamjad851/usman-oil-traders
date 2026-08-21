# Usman Oil Traders

Foundation for the Usman Oil Traders e-commerce and shop-management system in Kot Samaba, Rahim Yar Khan, Punjab, Pakistan.

This repository contains the project foundation and Phase 2 database schema only. Authentication, product/catalog functionality, inventory workflows, POS, orders, payments, reporting, and all other business features are intentionally not implemented yet.

The Phase 1 architecture is documented in [docs/architecture.md](docs/architecture.md). It is the repository's implementation reference for future phases and records the current conformance review.

The Phase 2 relational design and seed instructions are documented in [docs/database-schema.md](docs/database-schema.md).

## Stack

- Next.js App Router, React, and TypeScript
- Tailwind CSS v4 and shadcn/ui
- PostgreSQL with Prisma
- Zod for future input validation

## Current folder layout

```text
app/                 Next.js routes, layouts, and global styles
components/          Reusable UI; shadcn/ui components live in components/ui/
lib/                 Shared server and client utilities
lib/auth/            Reserved for authentication and authorization code
lib/services/        Reserved for business-domain services
lib/validation/      Reserved for Zod schemas and input validation
prisma/              Prisma schema and future migrations
types/               Shared TypeScript types
```

The `@/*` TypeScript alias maps to the repository root, for example `@/components` and `@/lib`.

## Environment

Copy `.env.example` to `.env` and set `DATABASE_URL` to the production or local PostgreSQL connection string. `.env` files are ignored by Git.

`prisma.config.ts` loads `DATABASE_URL` from the environment and configures Prisma to use PostgreSQL. The initial Prisma schema intentionally has no domain models or migrations.

The example file also reserves variables for future Auth.js, Redis, object storage (Cloudflare R2/S3), and WhatsApp handoff work. They are not active yet.

## Commands

```bash
npm run dev              # Start the development server
npm run lint             # Run ESLint
npm run build            # Create a production build
npx prisma generate      # Generate Prisma client after schema changes
npm test                 # Unit/service-layer tests (mocked Prisma, no real DB needed)
npm run test:coverage    # Same, with a coverage report
npm run test:integration # Integration/concurrency tests against a real, disposable database
npm run test:e2e         # Playwright end-to-end tests against a real build
```

## Security boundary for future work

When admin and staff features are implemented, financial fields such as purchase price and profit must be selected and serialized only for `SUPER_ADMIN`. Staff-facing API responses must not include them.

## Testing

There are four layers, each with a different tradeoff between speed and how much of the real
stack it actually exercises:

| Layer | Command | What it needs | What it proves |
|---|---|---|---|
| Unit / service-layer | `npm test` | Nothing — every service function accepts an injectable client that defaults to the real one | Business logic, validation, and role-check correctness in isolation |
| Integration | `npm run test:integration` | Nothing extra — boots its own database | Real Postgres transactions, row-locking, and Redis-backed rate limiting actually work, not just the mocked version of them |
| End-to-end | `npm run test:e2e` | Nothing extra — boots its own database and a real `next build` | The full stack is wired together correctly (browser → API → DB) for the handful of journeys that matter most |
| Coverage | `npm run test:coverage` | Nothing extra | Which service files have unusually thin unit coverage |

### Prerequisites

None beyond `npm install` — no Docker, no manually-installed Postgres or Redis, and no
credentials to any pre-existing database. The integration and E2E suites boot their own
completely disposable Postgres and Redis servers as real local child processes:

- **Postgres**: [`embedded-postgres`](https://www.npmjs.com/package/embedded-postgres) downloads
  and runs an actual native Postgres binary for the current platform (Windows, Linux, and macOS
  are all supported) against a throwaway temp data directory. This matters specifically because an
  earlier attempt using an in-process WASM Postgres (`@electric-sql/pglite`, over a socket bridge)
  was found to deadlock under genuine cross-connection row-lock contention — it only ever executes
  one query at a time internally, which defeats the entire point of the concurrency test. A real
  Postgres binary doesn't have that limitation.
- **Redis**: [`redis-memory-server`](https://www.npmjs.com/package/redis-memory-server) downloads
  and runs a real `redis-server` binary the same way.

Both are torn down automatically when the test run finishes. Nothing is written to any database
you already have configured in `.env` — `DATABASE_URL`/`REDIS_URL` are overridden for the duration
of the run only.

### A one-time consent prompt from Prisma

The first time `npx prisma db push` runs against the disposable test database (inside
`tests/integration/global-setup.ts` / `tests/e2e/global-setup.ts`), Prisma's own built-in
AI-agent safety guard may ask for explicit confirmation if it's invoked from an AI coding
assistant session, since `db push` can be destructive. This has no effect on a normal terminal run
or on CI (the guard specifically detects AI-agent environment variables that aren't present in
either case) — it only surfaces when an AI agent runs the command itself, and by design requires a
fresh, real answer from a person each time rather than a stored bypass.

### Concurrency test

`tests/integration/stock-race.test.ts` is the highest-value test in the suite: it fires two real,
concurrent transactions at the real disposable Postgres — two POS sales for the last unit of
stock, and separately a POS sale racing a staff order-confirmation for the last unit — and asserts
that exactly one succeeds and stock never goes negative. This is backed by real row-level locking
in `lib/services/local-sale.service.ts` and `order.service.ts` (`stockQuantity: { decrement }`
inside a transaction, checked and rolled back if it would go negative), not application-level
luck. It was verified to actually fail (both sales succeeding, stock going negative) when that
guard is temporarily disabled, and to pass again once restored — see this phase's own report for
the recorded proof.

### CI

`.github/workflows/ci.yml` runs three jobs on every push and pull request: lint + typecheck +
unit tests (fast, runs first), then integration and end-to-end tests in parallel (both need the
first job to pass first). No Postgres/Redis service containers are configured — the same
self-contained embedded-postgres/redis-memory-server setup that runs locally also runs unmodified
on the `ubuntu-latest` runner.
