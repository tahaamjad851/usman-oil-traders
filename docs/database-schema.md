# Phase 2 Database Schema

`prisma/schema.prisma` is the executable source for the Phase 2 relational design. It defines the User, catalog, customer-pricing, supplier-purchasing, inventory-ledger, website-order, local-sale, payment, expense, audit-log, and settings models.

All monetary amounts use PostgreSQL `Decimal` columns. Transaction items snapshot their price or cost (`PurchaseItem.unitCost`, `OrderItem.unitPrice`, and `LocalSaleItem.unitPrice`) to preserve historical reporting accuracy.

`InventoryTransaction` uses nullable `orderId`, `localSaleId`, and `purchaseId` foreign keys instead of a polymorphic reference. `branchId` is nullable on `Purchase`, `LocalSale`, and `InventoryTransaction` for future multi-branch support.

`Product.subcategoryId` is implemented as a nullable foreign key to `Category`, in addition to the required parent `categoryId`. The supplied example declared that ID without a relation; adding the foreign key is an integrity correction that preserves the documented category hierarchy.

The Phase 2 document's exact-one-parent payment rule requires application validation and a PostgreSQL `CHECK` constraint in the initial SQL migration. That migration was not created because `DATABASE_URL` is still a template placeholder.

## Seed data

Run `npm run db:seed` after configuring PostgreSQL and applying the initial migration. The idempotent seed creates only these categories:

- Engine Oils
  - Car Engine Oil
  - Motorcycle Engine Oil
  - Tractor Engine Oil
- Motorcycle Parts
- Tractor Parts

It creates ZIC, Shell, Caltex, Total, PSO, Honda, Havoline, and Suzuki. It does not create a Car Spare Parts category.

## Prisma 7 note

The Phase 2 document uses the older `prisma-client-js` generator example. This repository retains Prisma 7's `prisma-client` generator and `prisma.config.ts` datasource configuration. The generated client needs `@prisma/adapter-pg` and `pg`, which are used by the seed script. This is a runtime compatibility adaptation, not a change to the PostgreSQL/Prisma architecture.
