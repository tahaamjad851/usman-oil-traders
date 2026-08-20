import "server-only";

// Shared between order.service.ts and local-sale.service.ts: unitCost is snapshotted onto both
// OrderItem and LocalSaleItem (Phase 12) so profit reporting never has to join back to the current
// Product.purchasePrice, but it must never appear in any order/sale API response — not even to
// SUPER_ADMIN, since neither the order-management nor POS UI needs it there. Only
// accounting.service.ts reads it, directly from the database, for the reports SUPER_ADMIN sees.
export function stripCostBasis<T extends Record<string, unknown>>(items: T[]): T[] {
  // Deletes and casts back to T (rather than an Omit<T, "unitCost">) deliberately: T here is
  // usually an intersection type with an index signature (the loose DI-friendly types used
  // throughout this codebase), and TypeScript's Omit collapses named properties to `unknown`
  // over such intersections. Every caller's `unitCost` field is already optional in its type, so
  // casting back to T after removing it at runtime doesn't misrepresent the contract.
  return items.map((item) => {
    const clone: Record<string, unknown> = { ...item };
    delete clone.unitCost;
    return clone as T;
  });
}
