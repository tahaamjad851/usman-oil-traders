# Usman Oil Traders — Phase 1 Architecture

## Source of truth and scope

This document records the Phase 1 architecture supplied for Usman Oil Traders. It is the source of truth for future implementation work unless superseded by an explicit, documented project decision.

This repository implements the Phase 2 relational schema and seed data only. It does not implement authentication, product/catalog functionality, inventory workflows, purchases, orders, POS, payments, expenses, reports, or audit logging.

## Confirmed architecture

- One Next.js application with two route groups: `(storefront)` for the public customer experience and `(admin)` for the private dashboard. Both share one PostgreSQL database, API layer, Prisma client, validation layer, and service layer.
- Public browsing and guest checkout only in v1. Customer accounts are deferred; the data model will preserve a path to add them later.
- No online payment in v1. Website orders hand off to WhatsApp and payments are recorded manually later in the roadmap.
- Roles at launch are `SUPER_ADMIN` (owner) and `STAFF` (shopkeeper). The schema must permit later roles without a rewrite.
- PKR is the only currency in v1.
- The launch location is Kot Samaba. The Phase 2 schema must allow a nullable `branchId` on inventory, purchases, and local sales for an additive future multi-branch migration.
- Images belong in Cloudflare R2 or S3-compatible object storage, never PostgreSQL binary columns.
- PostgreSQL is the transactional source of truth. Stock-changing actions must run inside database transactions.

## Application boundaries

```text
PostgreSQL
    ↑ Prisma
Next.js route handlers
    ├── authorization and resource checks
    ├── Zod validation
    ├── service functions
    └── audit-log writes for sensitive mutations
        ├── public storefront
        └── authenticated admin/staff dashboard

Supporting services: Redis; Cloudflare R2 or S3; WhatsApp deep links
```

Route guards are a user-experience measure only. Each service function must re-check authorization server-side. Route handlers must not scatter direct Prisma mutations: service functions own permission checks, audit logging, and transactions.

## Security and role boundary

Purchase prices, supplier costs, margins, and profit are `SUPER_ADMIN`-only. They must not be fetched, serialized, or returned by any staff-facing backend response. Staff permission checks apply in middleware and in the relevant service function. Session claims should contain only user identity and role; permission-sensitive facts are re-read from the database.

| Capability | `SUPER_ADMIN` | `STAFF` |
|---|---:|---:|
| View catalog, selling prices, inventory, customers, payment history | Yes | Yes |
| View purchase price, supplier costs/balances, expenses, profit, audit log | Yes | No |
| Create/edit/delete products; manage categories, brands, suppliers, settings, staff | Yes | No |
| Update stock | Yes | Limited, logged reason codes |
| Create purchases | Yes | No |
| Manage customer pricing | Yes | No |
| Process website orders; confirm final amount | Yes | Yes, confirmation logged |
| Create local sales; record payments | Yes | Yes |
| View sales reporting | Yes | Own sales activity only |
| Manage expenses | Yes | Pending decision; default is no access |

This matrix is enforced by middleware and service functions. Product price/cost changes and purchases are owner-only.

## Phase 2 data-model

The full Prisma schema is implemented in `prisma/schema.prisma`; the initial migration is deferred until PostgreSQL is configured. The entities are:

- `User`, `AuditLog`, `Product`, `ProductImage`, `Category`, `Brand`, `Supplier`, `Customer`, and `CustomerPrice`
- `Purchase` and `PurchaseItem`
- `Order` and `OrderItem`; `LocalSale` and `LocalSaleItem`
- `Payment`, `Expense`, `InventoryTransaction`, and `Settings`

`InventoryTransaction` is the stock ledger; a product stock quantity is a derived/cache value maintained in the same transaction. Purchase costs must be snapshotted at purchase time. A payment belongs to exactly one of an order or local sale, enforced by database constraint and application validation. Categories are self-referential for subcategories.

## Planned routes (not implemented)

Storefront routes: `/`, `/products`, `/products/[slug]`, `/cart`, `/order/[orderId]`, `/track`, `/about`, and `/contact`.

Private routes are under `/admin`, including login, dashboard, products, categories, inventory, purchases, suppliers, orders, POS, customers, payments, expenses, reports, staff, settings, and audit log. Their access follows the Phase 1 role matrix.

The API will use Next.js route handlers, Zod validation, service functions, and response shaping by role. The storefront cart remains client-side/local storage in v1. Full endpoint design remains for later phases.

## Deployment direction

The preferred deployment is a VPS running Docker Compose with the app, PostgreSQL, Redis, and a reverse proxy, plus off-server object storage and automated nightly PostgreSQL backups. Managed Vercel + managed Postgres + Upstash remains a valid alternative. The final hosting choice is pending project confirmation.

## Implementation status review — 2026-08-13

| Area | Status | Notes |
|---|---|---|
| Next.js application baseline | Implemented | One App Router application, ready for future route groups. |
| TypeScript | Implemented | Strict TypeScript and `@/*` import alias are configured. |
| Styling | Implemented | Tailwind CSS and shadcn/ui are configured. |
| PostgreSQL / Prisma configuration | Implemented | PostgreSQL datasource, Prisma config, environment template, full Phase 2 schema, and generated client exist; no migration yet because the configured URL is a placeholder. |
| Zod | Implemented | Dependency installed; no schemas yet, by design. |
| Folder boundaries | Implemented | `lib/auth`, `lib/services`, `lib/validation`, and `types` are reserved and empty. |
| Route groups, route handlers, services | Missing by design | Deferred until the relevant later phases. |
| Data schema | Implemented | Models, enums, foreign keys, indexes, Decimal monetary fields, and seed data are in place. |
| Initial migration | Missing by configuration | It will be created only after a real PostgreSQL `DATABASE_URL` is configured. |
| Auth, RBAC, Redis, R2/S3, sharp | Missing by design | Deferred to later phases. |
| Storefront, dashboard, products, inventory, purchases, orders, POS, payments, expenses, reports, audit log | Missing by design | No later-phase business functionality has been started. |

## Stack conformance and recorded issues

The repository matches the Phase 1 choices for a single Next.js application, TypeScript, Tailwind CSS, shadcn/ui, PostgreSQL configuration, Prisma, Zod, Redis/R2/S3 environment placeholders, and a future service layer.

Two differences require an explicit decision before later implementation:

1. Phase 1 specifies Next.js 15. The current repository uses Next.js 16.3.0. This is a version deviation, not an architectural redesign. No version change has been made in this review.
2. The installed Prisma 7.9.1 dependency tree reports that `@prisma/streams-local` requires Node 22 or newer, while the current runtime is Node 20.19.5. The project lint and production build passed, but the supported Node/Prisma version should be aligned before Phase 2.

Pending Phase 1 confirmations remain unchanged: hosting choice, whether staff may submit expenses, brand/image assets, and confirmation of Retail / Mechanic / Wholesale / Custom pricing tiers.
