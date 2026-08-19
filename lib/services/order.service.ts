import "server-only";

import { prisma } from "@/lib/db";
import { requireAnyRole, ValidationError } from "@/lib/auth/guard";
import {
  createOrderSchema,
  updateOrderStatusSchema,
  type OrderQuery,
} from "@/lib/validation/order.schema";
import type { AuthContext } from "@/types/auth";

// Statuses at/after which an order's stock has been committed (decremented from Product) rather
// than merely reserved-in-intent. NEW and WHATSAPP_CONTACTED come before a human has actually
// confirmed the order is real and the price/availability with the customer, so no stock movement
// happens there — see updateOrderStatus() below, which is where the actual decrement happens.
const STOCK_COMMITTED_STATUSES = [
  "PRICE_CONFIRMED",
  "PAYMENT_PENDING",
  "PAYMENT_RECEIVED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
] as const;

function hasStockCommitted(status: string): boolean {
  return (STOCK_COMMITTED_STATUSES as readonly string[]).includes(status);
}

// ---------------------------------------------------------------------------
// Guest order creation
// ---------------------------------------------------------------------------

type OrderProductStub = { id: string; name: string; status: string; stockQuantity: number; retailPrice: unknown };

export type OrderCreateClient = {
  product: {
    findMany: (args: { where: { id: { in: string[] } } }) => Promise<OrderProductStub[]>;
  };
  customer: {
    upsert: (args: Record<string, unknown>) => Promise<{ id: string }>;
  };
  orderSequence: {
    upsert: (args: Record<string, unknown>) => Promise<unknown>;
    update: (args: Record<string, unknown>) => Promise<{ nextValue: number }>;
  };
  order: {
    create: (args: {
      data: Record<string, unknown>;
      include: { items: true };
    }) => Promise<
      Record<string, unknown> & {
        id: string;
        orderNumber: string;
        items: Array<{ productName: string; quantity: number }>;
      }
    >;
  };
};

export type TransactionalOrderCreateClient = OrderCreateClient & {
  $transaction: <T>(fn: (tx: OrderCreateClient) => Promise<T>) => Promise<T>;
};

async function nextOrderNumber(tx: OrderCreateClient): Promise<string> {
  // The upsert with a no-op update is idempotent under concurrency (Postgres compiles it to
  // INSERT ... ON CONFLICT DO UPDATE), so two orders racing to create row id=1 for the first time
  // ever can't collide. The following increment is then a plain atomic column update.
  await tx.orderSequence.upsert({
    where: { id: 1 },
    create: { id: 1, nextValue: 10001 },
    update: {},
  });
  const updated = await tx.orderSequence.update({
    where: { id: 1 },
    data: { nextValue: { increment: 1 } },
  });
  return `UOT-${updated.nextValue - 1}`;
}

// No accounts, no login: a guest places an order with just contact details. Price is snapshotted
// from the current Product.retailPrice onto each OrderItem at creation time and never re-derived
// later, so a subsequent price change never rewrites the historical record of what was ordered.
//
// Deliberately does NOT touch Product.stockQuantity or write an InventoryTransaction here — per
// the explicit business rule, stock is only committed once a staff member confirms the order (see
// updateOrderStatus below). A merely-PENDING/NEW order does not reserve stock.
export async function createOrder(
  input: unknown,
  client: TransactionalOrderCreateClient = prisma as unknown as TransactionalOrderCreateClient,
) {
  const data = createOrderSchema.parse(input);

  const productIds = data.items.map((item) => item.productId);
  const uniqueIds = [...new Set(productIds)];
  if (uniqueIds.length !== productIds.length) {
    throw new ValidationError("Duplicate product in your cart — combine quantities into a single line.");
  }

  const products = await client.product.findMany({ where: { id: { in: uniqueIds } } });
  if (products.length !== uniqueIds.length) {
    throw new ValidationError("One or more items in your cart are no longer available.");
  }

  const unavailable = products.filter((product) => product.status !== "ACTIVE" || product.stockQuantity <= 0);
  if (unavailable.length > 0) {
    throw new ValidationError(
      `Sorry, these items are currently out of stock: ${unavailable.map((product) => product.name).join(", ")}`,
    );
  }

  return client.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({
      where: { phone: data.customerPhone },
      create: {
        name: data.customerName,
        phone: data.customerPhone,
        address: data.customerAddress,
      },
      update: {
        name: data.customerName,
        address: data.customerAddress,
      },
    });

    const orderNumber = await nextOrderNumber(tx);

    const items = data.items.map((item) => {
      const product = products.find((candidate) => candidate.id === item.productId);
      if (!product) throw new ValidationError("One or more items in your cart are no longer available.");
      const lineTotal = (Number(product.retailPrice) * item.quantity).toFixed(2);
      return {
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: product.retailPrice,
        lineTotal,
      };
    });
    const websiteSubtotal = items.reduce((sum, item) => sum + Number(item.lineTotal), 0).toFixed(2);

    return tx.order.create({
      data: {
        orderNumber,
        customerId: customer.id,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        customerAddress: data.customerAddress,
        customerNotes: data.customerNotes,
        websiteSubtotal,
        status: "NEW",
        paymentStatus: "PENDING",
        items: { create: items },
      },
      include: { items: true },
    });
  });
}

// ---------------------------------------------------------------------------
// Admin/staff order queue
// ---------------------------------------------------------------------------

type OrderLister = {
  findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
  count: (args: Record<string, unknown>) => Promise<number>;
};

// Deliberately no `include: { items: { include: { product: true } } }` — every field the order
// queue needs (product name, the snapshotted unitPrice/quantity/lineTotal) already lives directly
// on OrderItem. Joining the live Product row here would be the one way this view could leak
// purchasePrice to STAFF, so it's never included.
export async function listOrders(
  ctx: AuthContext,
  filters: OrderQuery,
  orderLister: OrderLister = prisma.order as unknown as OrderLister,
) {
  requireAnyRole(ctx, ["SUPER_ADMIN", "STAFF"]);

  const where: Record<string, unknown> = {};
  if (filters.status) where.status = filters.status;

  const [items, total] = await Promise.all([
    orderLister.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    orderLister.count({ where }),
  ]);

  return { items, total, page: filters.page, pageSize: filters.pageSize };
}

type OrderReader = {
  findUniqueOrThrow: (args: Record<string, unknown>) => Promise<unknown>;
};

export async function getOrder(
  ctx: AuthContext,
  orderId: string,
  orderReader: OrderReader = prisma.order as unknown as OrderReader,
) {
  requireAnyRole(ctx, ["SUPER_ADMIN", "STAFF"]);
  return orderReader.findUniqueOrThrow({
    where: { id: orderId },
    // No `product` join on either relation — Payment has no cost field to begin with, and every
    // item field the detail view needs (name, snapshotted price/qty) already lives on OrderItem.
    // Voided payments are included too (not filtered out) so staff can still see that one was
    // recorded and later voided, with its reason — only the paid-total math excludes them.
    include: { items: true, payments: true },
  });
}

// ---------------------------------------------------------------------------
// Status transitions (staff/admin) — this is where stock actually moves
// ---------------------------------------------------------------------------

type OrderRecord = {
  id: string;
  orderNumber: string;
  status: string;
  confirmedById: string | null;
  finalProductAmount?: unknown;
  deliveryCharge?: unknown;
  discount?: unknown;
  websiteSubtotal: unknown;
  items: Array<{ productId: string; productName: string; quantity: number }>;
};

export type OrderStatusClient = {
  order: {
    findUniqueOrThrow: (args: { where: { id: string }; include?: unknown }) => Promise<OrderRecord>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
  product: {
    update: (args: {
      where: { id: string };
      data: { stockQuantity: { increment: number } | { decrement: number } };
    }) => Promise<{ id: string; stockQuantity: number }>;
  };
  inventoryTransaction: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
  auditLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
};

export type TransactionalOrderStatusClient = OrderStatusClient & {
  $transaction: <T>(fn: (tx: OrderStatusClient) => Promise<T>) => Promise<T>;
};

export async function updateOrderStatus(
  ctx: AuthContext,
  orderId: string,
  input: unknown,
  client: TransactionalOrderStatusClient = prisma as unknown as TransactionalOrderStatusClient,
) {
  requireAnyRole(ctx, ["SUPER_ADMIN", "STAFF"]);
  const data = updateOrderStatusSchema.parse(input);

  return client.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });

    if (order.status === "CANCELLED") {
      throw new ValidationError("This order is already cancelled.");
    }
    if (order.status === "DELIVERED" && data.status !== "DELIVERED") {
      throw new ValidationError("A delivered order's status can no longer be changed.");
    }

    const wasCommitted = hasStockCommitted(order.status);
    const willBeCommitted = hasStockCommitted(data.status);

    if (!wasCommitted && willBeCommitted) {
      // First time this order commits stock (e.g. staff just confirmed price/availability with
      // the customer over WhatsApp) — decrement every line item now, atomically.
      for (const item of order.items) {
        const updated = await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { decrement: item.quantity } },
        });

        const wentNegative = updated.stockQuantity < 0;
        if (wentNegative && !data.allowNegativeStock) {
          throw new ValidationError(
            `Confirming this order would take "${item.productName}" stock to ${updated.stockQuantity}. Pass allowNegativeStock to override.`,
          );
        }
        if (wentNegative) {
          console.warn(
            `[orders] Confirming order ${order.orderNumber} took stock for product ${item.productId} negative (${updated.stockQuantity}).`,
          );
        }

        await tx.inventoryTransaction.create({
          data: {
            productId: item.productId,
            type: "WEBSITE_ORDER",
            quantityDelta: -item.quantity,
            resultingQty: updated.stockQuantity,
            orderId: order.id,
            performedById: ctx.userId,
          },
        });
      }
    } else if (wasCommitted && !willBeCommitted) {
      // Stock was already committed for this order and the new status is not a committed one —
      // whether that's an explicit CANCELLED or staff moving it backward to e.g.
      // WHATSAPP_CONTACTED (a corrected mistake, a re-negotiation, etc.), the stock must be
      // restored either way. Forward transitions between two committed statuses (PRICE_CONFIRMED
      // -> PAYMENT_PENDING -> ... -> DELIVERED) leave willBeCommitted true, so this branch never
      // fires for them — no double-restore, no restore-then-immediately-redecrement.
      for (const item of order.items) {
        const updated = await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { increment: item.quantity } },
        });

        await tx.inventoryTransaction.create({
          data: {
            productId: item.productId,
            type: "ORDER_CANCELLATION",
            quantityDelta: item.quantity,
            resultingQty: updated.stockQuantity,
            orderId: order.id,
            performedById: ctx.userId,
          },
        });
      }
    }

    const updateData: Record<string, unknown> = { status: data.status };

    if (data.status === "PRICE_CONFIRMED" && !order.confirmedById) {
      updateData.confirmedById = ctx.userId;
      updateData.confirmedAt = new Date();
    }

    if (
      data.finalProductAmount !== undefined ||
      data.deliveryCharge !== undefined ||
      data.discount !== undefined
    ) {
      if (data.finalProductAmount !== undefined) updateData.finalProductAmount = data.finalProductAmount;
      if (data.deliveryCharge !== undefined) updateData.deliveryCharge = data.deliveryCharge;
      if (data.discount !== undefined) updateData.discount = data.discount;

      const finalProduct = Number(data.finalProductAmount ?? order.finalProductAmount ?? order.websiteSubtotal);
      const delivery = Number(data.deliveryCharge ?? order.deliveryCharge ?? 0);
      const discountAmount = Number(data.discount ?? order.discount ?? 0);
      updateData.finalConfirmedAmount = (finalProduct + delivery - discountAmount).toFixed(2);
    }

    const updated = await tx.order.update({ where: { id: orderId }, data: updateData });

    await tx.auditLog.create({
      data: {
        userId: ctx.userId,
        action: "ORDER_STATUS_CHANGED",
        entityType: "Order",
        entityId: orderId,
        previousValue: { status: order.status },
        newValue: { status: data.status },
        ipAddress: ctx.ip,
      },
    });

    return updated;
  });
}
