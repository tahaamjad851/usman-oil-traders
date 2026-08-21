// Plain constants only — deliberately no Prisma import here. Playwright's own spec-file loader
// runs in strict ESM mode and cannot load lib/generated/prisma/client.ts's CommonJS-style output
// (`exports.X = ...`) the way Vitest's Vite-based transform can, so spec files must never import
// anything that transitively pulls in the Prisma client. seed.ts (which does the actual database
// writes) imports these constants too, but is only ever invoked as a subprocess by
// global-setup.ts, never imported by a spec file.
export const E2E_SUPER_ADMIN = { username: "e2e-super-admin", password: "E2eSuperAdmin!23456" };
export const E2E_STAFF = { username: "e2e-staff", password: "E2eStaffPassword!234" };
export const E2E_CHECKOUT_PRODUCT_SLUG = "e2e-checkout-oil";
export const E2E_OUT_OF_STOCK_PRODUCT_SLUG = "e2e-out-of-stock-oil";
export const E2E_POS_PRODUCT_NAME = "E2E POS Brake Fluid 1L";
export const E2E_POS_PRODUCT_SKU = "E2E-POS-SKU";
// Deterministic: the seed script always runs once against a freshly created, empty test database,
// and OrderSequence is seeded to start at exactly this value — so the one order it creates is
// always UOT-90001, and spec files can reference it directly by name rather than needing the seed
// script to communicate an id/number back to them at runtime.
export const E2E_SEEDED_ORDER_NUMBER = "UOT-90001";
