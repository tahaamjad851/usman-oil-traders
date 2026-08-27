import Link from "next/link";
import { redirect } from "next/navigation";

import { PasswordChangeRequiredError } from "@/lib/auth/guard";
import { getAuthContext } from "@/lib/auth/session";
import { listCustomersWithBalance } from "@/lib/services/customer.service";
import { listProducts } from "@/lib/services/product.service";
import { listSuppliersWithBalance } from "@/lib/services/supplier.service";

import { NewPurchaseForm } from "./new-purchase-form";
import { NewSupplierForm } from "./new-supplier-form";

type AuthCtx = Awaited<ReturnType<typeof getAuthContext>>;

type SupplierRow = { id: string; name: string; totalPurchased: number; totalPaid: number; balance: number };
type CustomerRow = { id: string; name: string; phone: string; balance: number };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminKhataPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  let ctx: AuthCtx;

  try {
    ctx = await getAuthContext();
  } catch (error) {
    if (error instanceof PasswordChangeRequiredError) {
      redirect("/admin/change-password");
    }
    redirect("/admin/login");
  }

  const params = await searchParams;
  const tab = first(params.tab) === "buyers" ? "buyers" : "suppliers";

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Khata</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Money owed to suppliers and money owed by buyers. Signed in as {ctx.username} (SUPER_ADMIN)
        </p>
      </div>

      <nav className="flex flex-wrap gap-3 text-sm">
        <Link
          href="/admin/khata?tab=suppliers"
          className={tab === "suppliers" ? "font-semibold underline" : "text-muted-foreground"}
        >
          Suppliers
        </Link>
        <Link
          href="/admin/khata?tab=buyers"
          className={tab === "buyers" ? "font-semibold underline" : "text-muted-foreground"}
        >
          Buyers
        </Link>
      </nav>

      {tab === "suppliers" ? <SuppliersTab ctx={ctx} /> : <BuyersTab ctx={ctx} />}
    </main>
  );
}

async function SuppliersTab({ ctx }: { ctx: AuthCtx }) {
  const [suppliers, productResult] = await Promise.all([
    listSuppliersWithBalance(ctx),
    listProducts(ctx, { page: 1, pageSize: 200, status: "ACTIVE" }),
  ]);

  const supplierRows = suppliers as unknown as SupplierRow[];
  const products = (productResult.items as unknown as { id: string; name: string; sku: string }[]).map(
    (product) => ({ id: product.id, name: product.name, sku: product.sku }),
  );
  const supplierOptions = supplierRows.map((supplier) => ({ id: supplier.id, name: supplier.name }));

  return (
    <>
      {supplierRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No suppliers yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">Supplier</th>
                <th className="px-3 py-2 text-right">Total purchased</th>
                <th className="px-3 py-2 text-right">Total paid</th>
                <th className="px-3 py-2 text-right">Balance owed</th>
              </tr>
            </thead>
            <tbody>
              {supplierRows.map((supplier) => (
                <tr key={supplier.id} className="border-t">
                  <td className="px-3 py-2">
                    <Link href={`/admin/khata/suppliers/${supplier.id}`} className="hover:underline">
                      {supplier.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">Rs {supplier.totalPurchased.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-mono">Rs {supplier.totalPaid.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    <span className={supplier.balance > 0 ? "text-destructive" : undefined}>
                      Rs {supplier.balance.toLocaleString()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium">Add a supplier</h2>
        <NewSupplierForm />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">Log a purchase</h2>
        <NewPurchaseForm suppliers={supplierOptions} products={products} />
      </section>
    </>
  );
}

async function BuyersTab({ ctx }: { ctx: AuthCtx }) {
  const result = await listCustomersWithBalance(ctx, { page: 1, pageSize: 100 });
  const customers = result.items as unknown as CustomerRow[];

  return (
    <>
      {customers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No buyer accounts yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2 text-right">Balance owed</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id} className="border-t">
                  <td className="px-3 py-2">{customer.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{customer.phone}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    <span className={customer.balance > 0 ? "text-destructive" : undefined}>
                      Rs {customer.balance.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/admin/khata/buyers/${customer.id}`} className="text-xs hover:underline">
                      Record payment →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{result.total} buyers</p>
    </>
  );
}
