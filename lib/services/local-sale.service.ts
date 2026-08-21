import "server-only";

import { prisma } from "@/lib/db";
import { ForbiddenError, requireAnyRole, ValidationError } from "@/lib/auth/guard";
import { stripCostBasis } from "@/lib/services/sale-item-shaping";
import {
  createLocalSaleSchema,
  type LocalSaleQuery,
} from "@/lib/validation/local-sale.schema";
import type { AuthContext } from "@/types/auth";

// ---------------------------------------------------------------------------
// Sale creation — the counter-facing "ring it up now" flow
// ---------------------------------------------------------------------------
//
// A POS sale is deliberately NOT modeled on Order: an Order starts as a price-unconfirmed
// inquiry (NEW) and only commits stock once staff move it to PRICE_CONFIRMED after negotiating
// over WhatsApp, because the order has no in-person moment where price and payment are both
// settled at once. A POS sale is the opposite — price and payment are final the instant the
// customer hands over cash at the counter, there's no negotiation step, and it often has no
// customer record at all. Phase 2 already modeled exactly this as LocalSale/LocalSaleItem
// (optional customerId, no address, no negotiation status), so this service reuses that schema
// as-is rather than introducing a third order-like model.

type SaleProductStub = {
  id: string;
  name: string;
  status: string;
  stockQuantity: number;
  retailPrice: unknown;
  purchasePrice: unknown;
};

export type LocalSaleCreateClient = {
  product: {
    findMany: (args: { where: { id: { in: string[] } } }) => Promise<SaleProductStub[]>;
    update: (args: {
      where: { id: string };
      data: { stockQuantity: { decrement: number } };
    }) => Promise<{ id: string; stockQuantity: number }>;
  };
  customer: {
    upsert: (args: Record<string, unknown>) => Promise<{ id: string }>;
  };
  localSaleSequence: {
    createMany: (args: { data: Array<Record<string, unknown>>; skipDuplicates?: boolean }) => Promise<unknown>;
    update: (args: Record<string, unknown>) => Promise<{ nextValue: number }>;
  };
  localSale: {
    create: (args: {
      data: Record<string, unknown>;
      include: { items: true };
    }) => Promise<{
      id: string;
      saleNumber: string;
      items: Array<
        { id: string; productId: string; productName: string; quantity: number; unitCost?: unknown } & Record<
          string,
          unknown
        >
      >;
    }>;
  };
  inventoryTransaction: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
  payment: {
    create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown> & { id: string }>;
  };
  auditLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
};

export type TransactionalLocalSaleClient = LocalSaleCreateClient & {
  $transaction: <T>(fn: (tx: LocalSaleCreateClient) => Promise<T>) => Promise<T>;
};

async function nextSaleNumber(tx: LocalSaleCreateClient): Promise<string> {
  // See the identical comment in order.service.ts's nextOrderNumber — createMany + skipDuplicates
  // (a real INSERT ... ON CONFLICT DO NOTHING) replaces an upsert that was verified, under real
  // concurrent load, to poison the whole surrounding transaction when two sales raced to create
  // row id=1 for the first time.
  await tx.localSaleSequence.createMany({ data: [{ id: 1, nextValue: 1 }], skipDuplicates: true });
  const updated = await tx.localSaleSequence.update({
    where: { id: 1 },
    data: { nextValue: { increment: 1 } },
  });
  return `LS-${updated.nextValue - 1}`;
}

export async function createLocalSale(
  ctx: AuthContext,
  input: unknown,
  client: TransactionalLocalSaleClient = prisma as unknown as TransactionalLocalSaleClient,
) {
  requireAnyRole(ctx, ["SUPER_ADMIN", "STAFF"]);
  const data = createLocalSaleSchema.parse(input);

  const productIds = data.items.map((item) => item.productId);
  const uniqueIds = [...new Set(productIds)];
  if (uniqueIds.length !== productIds.length) {
    throw new ValidationError("Duplicate product on the ticket — adjust the quantity on one line instead.");
  }

  const products = await client.product.findMany({ where: { id: { in: uniqueIds } } });
  if (products.length !== uniqueIds.length) {
    throw new ValidationError("One or more products on this ticket were not found.");
  }
  const discontinued = products.filter((product) => product.status === "DISCONTINUED");
  if (discontinued.length > 0) {
    throw new ValidationError(
      `Cannot sell discontinued product(s): ${discontinued.map((product) => product.name).join(", ")}`,
    );
  }

  if (!data.allowNegativeStock) {
    const insufficient = data.items.filter((item) => {
      const product = products.find((candidate) => candidate.id === item.productId);
      return !product || product.stockQuantity < item.quantity;
    });
    if (insufficient.length > 0) {
      const names = insufficient
        .map((item) => products.find((product) => product.id === item.productId)?.name ?? item.productId)
        .join(", ");
      throw new ValidationError(`Not enough stock for: ${names}`);
    }
  }

  const items = data.items.map((item) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    if (!product) throw new ValidationError("One or more products on this ticket were not found.");
    const lineTotal = (Number(product.retailPrice) * item.quantity).toFixed(2);
    return {
      productId: product.id,
      productName: product.name,
      quantity: item.quantity,
      unitPrice: product.retailPrice,
      lineTotal,
      // Cost basis for Phase 12's profit reporting, frozen at sale time — never returned from
      // this function (see stripCostBasis below).
      unitCost: product.purchasePrice,
    };
  });
  const totalAmount = items.reduce((sum, item) => sum + Number(item.lineTotal), 0).toFixed(2);

  if (data.amountTendered !== undefined && Number(data.amountTendered) < Number(totalAmount)) {
    throw new ValidationError("Amount tendered is less than the sale total.");
  }

  return client.$transaction(async (tx) => {
    let customerId: string | undefined;
    if (data.customerPhone) {
      const customer = await tx.customer.upsert({
        where: { phone: data.customerPhone },
        create: { name: data.customerName ?? "Walk-in Customer", phone: data.customerPhone },
        update: data.customerName ? { name: data.customerName } : {},
      });
      customerId = customer.id;
    }

    const saleNumber = await nextSaleNumber(tx);

    const sale = await tx.localSale.create({
      data: {
        saleNumber,
        customerId,
        soldById: ctx.userId,
        totalAmount,
        items: { create: items },
      },
      include: { items: true },
    });

    let anyItemWentNegative = false;

    // One transaction for the sale, every stock decrement, every ledger row, and the payment
    // record — if any step fails, the whole sale rolls back, so stock can never end up decremented
    // without a matching sale (or vice versa).
    for (const item of sale.items) {
      const updated = await tx.product.update({
        where: { id: item.productId },
        data: { stockQuantity: { decrement: item.quantity } },
      });

      const wentNegative = updated.stockQuantity < 0;
      if (wentNegative && !data.allowNegativeStock) {
        throw new ValidationError(
          `Selling "${item.productName}" would take stock to ${updated.stockQuantity}. Pass allowNegativeStock to override.`,
        );
      }
      if (wentNegative) {
        anyItemWentNegative = true;
        console.warn(
          `[pos] Sale ${saleNumber} took stock for product ${item.productId} negative (${updated.stockQuantity}).`,
        );
      }

      // LOCAL_SALE already exists in the InventoryTransactionType enum from Phase 2 and is exactly
      // this case (stock leaving via an in-shop sale) — no separate "SALE_OUT" type was added.
      await tx.inventoryTransaction.create({
        data: {
          productId: item.productId,
          type: "LOCAL_SALE",
          quantityDelta: -item.quantity,
          resultingQty: updated.stockQuantity,
          localSaleId: sale.id,
          performedById: ctx.userId,
        },
      });
    }

    const payment = await tx.payment.create({
      data: {
        localSaleId: sale.id,
        customerId,
        amount: totalAmount,
        method: data.paymentMethod,
        amountTendered: data.amountTendered,
        transactionReference: data.transactionReference,
        status: "RECEIVED",
        receivedById: ctx.userId,
        notes: data.notes,
      },
    });

    // POS sale creation had no audit trail before Phase 13 — the Payment/InventoryTransaction
    // rows it creates carry some of the same facts, but not the negative-stock override, which is
    // exactly the kind of thing an owner reviewing the audit log needs to be able to find.
    await tx.auditLog.create({
      data: {
        userId: ctx.userId,
        action: "LOCAL_SALE_RECORDED",
        entityType: "LocalSale",
        entityId: sale.id,
        newValue: {
          saleNumber,
          totalAmount,
          itemCount: sale.items.length,
          paymentMethod: data.paymentMethod,
          negativeStockOverride: anyItemWentNegative,
        },
        ipAddress: ctx.ip,
      },
    });

    // unitCost never leaves this module — see sale-item-shaping.ts.
    return { ...sale, items: stripCostBasis(sale.items), payment };
  });
}

// ---------------------------------------------------------------------------
// Sales history
// ---------------------------------------------------------------------------

type LocalSaleWithItems = Record<string, unknown> & { items: Array<Record<string, unknown>> };

type LocalSaleLister = {
  findMany: (args: Record<string, unknown>) => Promise<LocalSaleWithItems[]>;
  count: (args: Record<string, unknown>) => Promise<number>;
};

// Deliberately no `include: { items: { include: { product: true } } }` — every field the history
// view needs (product name, snapshotted unitPrice/quantity/lineTotal) already lives directly on
// LocalSaleItem, so joining the live Product row (the only path that could leak purchasePrice to
// STAFF) is never necessary.
export async function listLocalSales(
  ctx: AuthContext,
  filters: LocalSaleQuery,
  lister: LocalSaleLister = prisma.localSale as unknown as LocalSaleLister,
) {
  requireAnyRole(ctx, ["SUPER_ADMIN", "STAFF"]);

  const where: Record<string, unknown> = {};
  // Staff sees only their own sales; admin sees everyone's (optionally filtered to one staff
  // member) — enforced here, not just hidden in the UI.
  if (ctx.role === "STAFF") {
    where.soldById = ctx.userId;
  } else if (filters.soldById) {
    where.soldById = filters.soldById;
  }
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  const [rows, total] = await Promise.all([
    lister.findMany({
      where,
      include: { items: true, customer: true, soldBy: { select: { id: true, name: true } }, payments: true },
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    lister.count({ where }),
  ]);

  // unitCost never leaves this module — see sale-item-shaping.ts.
  const items = rows.map((sale) => ({ ...sale, items: stripCostBasis(sale.items) }));

  return { items, total, page: filters.page, pageSize: filters.pageSize };
}

type LocalSaleRecord = Record<string, unknown> & {
  id: string;
  soldById: string;
  items: Array<Record<string, unknown>>;
};

type LocalSaleReader = {
  findUniqueOrThrow: (args: Record<string, unknown>) => Promise<LocalSaleRecord>;
};

export async function getLocalSale(
  ctx: AuthContext,
  saleId: string,
  reader: LocalSaleReader = prisma.localSale as unknown as LocalSaleReader,
) {
  requireAnyRole(ctx, ["SUPER_ADMIN", "STAFF"]);

  const sale = await reader.findUniqueOrThrow({
    where: { id: saleId },
    include: { items: true, customer: true, soldBy: { select: { id: true, name: true } }, payments: true },
  });

  // Symmetric with listLocalSales: a staff member can open their own sale's receipt/detail, but
  // not another staff member's, by guessing an id.
  if (ctx.role === "STAFF" && sale.soldById !== ctx.userId) {
    throw new ForbiddenError("This sale was not recorded by you.");
  }

  // unitCost never leaves this module — see sale-item-shaping.ts.
  return { ...sale, items: stripCostBasis(sale.items) };
}
