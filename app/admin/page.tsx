import Link from "next/link";
import { redirect } from "next/navigation";

import { PasswordChangeRequiredError } from "@/lib/auth/guard";
import { getAuthContext } from "@/lib/auth/session";
import type { AppRole } from "@/types/auth";

import { LogoutButton } from "./logout-button";

type AdminSection = {
  href: string;
  label: string;
  description: string;
  roles: AppRole[];
};

const SECTIONS: AdminSection[] = [
  {
    href: "/admin/orders",
    label: "Orders",
    description: "View and manage website orders",
    roles: ["SUPER_ADMIN", "STAFF"],
  },
  {
    href: "/admin/pos",
    label: "Point of Sale",
    description: "Ring up an in-store sale",
    roles: ["SUPER_ADMIN", "STAFF"],
  },
  {
    href: "/admin/pos/history",
    label: "Sales History",
    description: "Past POS sales and receipts",
    roles: ["SUPER_ADMIN", "STAFF"],
  },
  {
    href: "/admin/inventory",
    label: "Inventory",
    description: "Stock levels, low-stock alerts, and adjustments",
    roles: ["SUPER_ADMIN", "STAFF"],
  },
  {
    href: "/admin/payments",
    label: "Payments",
    description: "Received payments across orders and POS sales",
    roles: ["SUPER_ADMIN"],
  },
  {
    href: "/admin/expenses",
    label: "Expenses",
    description: "Track business expenses",
    roles: ["SUPER_ADMIN"],
  },
  {
    href: "/admin/reports",
    label: "Reports",
    description: "Revenue, profit, and inventory-value reports",
    roles: ["SUPER_ADMIN"],
  },
  {
    href: "/admin/audit-log",
    label: "Audit Log",
    description: "History of admin actions",
    roles: ["SUPER_ADMIN"],
  },
];

export default async function AdminPage() {
  let ctx: Awaited<ReturnType<typeof getAuthContext>>;

  try {
    ctx = await getAuthContext();
  } catch (error) {
    if (error instanceof PasswordChangeRequiredError) {
      redirect("/admin/change-password");
    }
    redirect("/admin/login");
  }

  const sections = SECTIONS.filter((section) => section.roles.includes(ctx.role));

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Usman Oil Traders</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as {ctx.username} ({ctx.role})
          </p>
        </div>
        <LogoutButton />
      </div>

      <nav aria-label="Admin sections" className="grid gap-3 sm:grid-cols-2">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded-md border p-4 transition-colors hover:bg-muted/50"
          >
            <p className="font-medium">{section.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
          </Link>
        ))}
      </nav>

      <div>
        <Link href="/admin/change-password" className="text-sm text-muted-foreground hover:underline">
          Change password
        </Link>
      </div>
    </main>
  );
}
