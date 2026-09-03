import Link from "next/link";
import { redirect } from "next/navigation";

import { PasswordChangeRequiredError } from "@/lib/auth/guard";
import { getAuthContext } from "@/lib/auth/session";
import { getLowStockReport, listInventoryTransactions } from "@/lib/services/inventory.service";

import { AdjustStockForm } from "./adjust-stock-form";
import { RestockForm } from "./restock-form";

type LowStockRow = {
  id: string;
  sku: string;
  name: string;
  stockQuantity: number;
  minimumStock: number;
};

type MovementRow = {
  id: string;
  type: string;
  quantityDelta: number;
  resultingQty: number;
  reason: string | null;
  createdAt: string | Date;
  product: { name: string; sku: string } | null;
  performedBy: { name: string; username: string } | null;
};

export default async function InventoryPage() {
  let ctx: Awaited<ReturnType<typeof getAuthContext>>;

  try {
    ctx = await getAuthContext();
  } catch (error) {
    if (error instanceof PasswordChangeRequiredError) {
      redirect("/admin/change-password");
    }
    redirect("/admin/login");
  }

  const [lowStock, recentMovements] = await Promise.all([
    getLowStockReport(ctx, { page: 1, pageSize: 20 }),
    listInventoryTransactions(ctx, { page: 1, pageSize: 20 }),
  ]);

  const lowStockItems = lowStock.items as LowStockRow[];
  const movements = recentMovements.items as MovementRow[];

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as {ctx.username} ({ctx.role})
        </p>
        <Link href="/admin/inventory/stock" className="mt-1 inline-block text-xs text-muted-foreground hover:underline">
          View full stock list →
        </Link>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Low stock ({lowStock.total})</h2>
        {lowStockItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No products are at or below their minimum stock level.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2 text-right">Stock</th>
                  <th className="px-3 py-2 text-right">Minimum</th>
                </tr>
              </thead>
              <tbody>
                {lowStockItems.map((product) => (
                  <tr key={product.id} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{product.sku}</td>
                    <td className="px-3 py-2">{product.name}</td>
                    <td className="px-3 py-2 text-right">
                      {product.stockQuantity <= 0 ? (
                        <span className="text-destructive">{product.stockQuantity}</span>
                      ) : (
                        product.stockQuantity
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{product.minimumStock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Recent stock movements</h2>
        {movements.length === 0 ? (
          <p className="text-sm text-muted-foreground">No stock movements recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2 text-right">Change</th>
                  <th className="px-3 py-2 text-right">Resulting qty</th>
                  <th className="px-3 py-2">By</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2">When</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((txn) => (
                  <tr key={txn.id} className="border-t">
                    <td className="px-3 py-2">{txn.product?.name ?? "—"}</td>
                    <td className="px-3 py-2">{txn.type}</td>
                    <td className="px-3 py-2 text-right">
                      {txn.quantityDelta > 0 ? `+${txn.quantityDelta}` : txn.quantityDelta}
                    </td>
                    <td className="px-3 py-2 text-right">{txn.resultingQty}</td>
                    <td className="px-3 py-2">{txn.performedBy?.name ?? "—"}</td>
                    <td className="px-3 py-2">{txn.reason ?? "—"}</td>
                    <td className="px-3 py-2">{new Date(txn.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Adjust stock</h2>
        <AdjustStockForm />
      </section>

      {ctx.role === "SUPER_ADMIN" ? (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Record a restock</h2>
          <RestockForm />
        </section>
      ) : null}
    </main>
  );
}
