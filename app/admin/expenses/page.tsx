import { redirect } from "next/navigation";

import { PasswordChangeRequiredError } from "@/lib/auth/guard";
import { getAuthContext } from "@/lib/auth/session";
import { listExpenses } from "@/lib/services/expense.service";
import { expenseCategories } from "@/lib/validation/expense.schema";

import { DeleteExpenseButton } from "./delete-button";
import { ExpenseForm } from "./expense-form";

type ExpenseRow = {
  id: string;
  category: string;
  amount: string;
  date: string | Date;
  description: string | null;
  createdBy: { name: string } | null;
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminExpensesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  let ctx: Awaited<ReturnType<typeof getAuthContext>>;

  try {
    ctx = await getAuthContext();
  } catch (error) {
    if (error instanceof PasswordChangeRequiredError) {
      redirect("/admin/change-password");
    }
    redirect("/admin/login");
  }

  const params = await searchParams;
  const category = first(params.category) as (typeof expenseCategories)[number] | undefined;
  const from = first(params.from);
  const to = first(params.to);

  const result = await listExpenses(ctx, {
    category,
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
    page: 1,
    pageSize: 50,
  });
  const expenses = result.items as ExpenseRow[];
  const grandTotal = result.categoryTotals.reduce((sum, row) => sum + row.total, 0);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Expenses</h1>
        <p className="mt-1 text-sm text-muted-foreground">Signed in as {ctx.username} (SUPER_ADMIN)</p>
      </div>

      <form className="flex flex-wrap items-end gap-3 text-sm" method="get">
        <label className="block">
          <span className="mb-1 block text-muted-foreground">Category</span>
          <select name="category" defaultValue={category ?? ""} className="rounded border bg-background px-2 py-1.5">
            <option value="">All</option>
            {expenseCategories.map((value) => (
              <option key={value} value={value}>
                {value.charAt(0) + value.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-muted-foreground">From</span>
          <input type="date" name="from" defaultValue={from} className="rounded border bg-background px-2 py-1.5" />
        </label>
        <label className="block">
          <span className="mb-1 block text-muted-foreground">To</span>
          <input type="date" name="to" defaultValue={to} className="rounded border bg-background px-2 py-1.5" />
        </label>
        <button type="submit" className="rounded border px-3 py-1.5">
          Filter
        </button>
      </form>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="font-mono text-lg">Rs {grandTotal.toLocaleString()}</p>
        </div>
        {result.categoryTotals.map((row) => (
          <div key={row.category} className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">{row.category.charAt(0) + row.category.slice(1).toLowerCase()}</p>
            <p className="font-mono text-lg">Rs {row.total.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {expenses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No expenses recorded for this filter.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">By</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id} className="border-t">
                  <td className="px-3 py-2">{new Date(expense.date).toLocaleDateString()}</td>
                  <td className="px-3 py-2">{expense.category.charAt(0) + expense.category.slice(1).toLowerCase()}</td>
                  <td className="px-3 py-2 text-muted-foreground">{expense.description ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{expense.createdBy?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono">Rs {Number(expense.amount).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">
                    <DeleteExpenseButton expenseId={expense.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{result.total} expenses</p>

      <section>
        <h2 className="mb-2 text-sm font-medium">Record a new expense</h2>
        <ExpenseForm />
      </section>
    </main>
  );
}
