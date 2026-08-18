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
npm run dev          # Start the development server
npm run lint         # Run ESLint
npm run build        # Create a production build
npx prisma generate  # Generate Prisma client after schema changes
```

## Security boundary for future work

When admin and staff features are implemented, financial fields such as purchase price and profit must be selected and serialized only for `SUPER_ADMIN`. Staff-facing API responses must not include them.
