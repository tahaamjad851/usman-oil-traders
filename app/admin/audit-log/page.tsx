import { redirect } from "next/navigation";

import { PasswordChangeRequiredError } from "@/lib/auth/guard";
import { getAuthContext } from "@/lib/auth/session";
import { listAuditLogs } from "@/lib/services/audit-log.service";

type AuditLogRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  createdAt: string | Date;
  user: { name: string; username: string } | null;
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function preview(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const text = JSON.stringify(value);
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

export default async function AdminAuditLogPage({
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
  const action = first(params.action);
  const entityType = first(params.entityType);
  const page = Number(first(params.page) ?? "1") || 1;

  // SUPER_ADMIN-only enforced inside listAuditLogs — a STAFF session reaching this page
  // (it shouldn't, since proxy.ts already blocks /admin/:path* for non-admin roles) would
  // still get rejected at the service layer, not just by the page-level route guard.
  const result = await listAuditLogs(ctx, { action, entityType, page, pageSize: 50 });
  const entries = result.items as AuditLogRow[];
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit Log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Append-only record of sensitive actions. Signed in as {ctx.username} (SUPER_ADMIN)
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 text-sm" method="get">
        <label className="block">
          <span className="mb-1 block text-muted-foreground">Action</span>
          <input
            type="text"
            name="action"
            defaultValue={action}
            placeholder="e.g. PAYMENT_VOIDED"
            className="rounded border bg-background px-2 py-1.5"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-muted-foreground">Entity type</span>
          <input
            type="text"
            name="entityType"
            defaultValue={entityType}
            placeholder="e.g. Payment"
            className="rounded border bg-background px-2 py-1.5"
          />
        </label>
        <button type="submit" className="rounded border px-3 py-1.5">
          Filter
        </button>
      </form>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No audit log entries for this filter.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Entity</th>
                <th className="px-3 py-2">Before</th>
                <th className="px-3 py-2">After</th>
                <th className="px-3 py-2">IP</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">{entry.user?.name ?? entry.user?.username ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{entry.action}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {entry.entityType} <span className="text-xs">{entry.entityId}</span>
                  </td>
                  <td className="max-w-[16rem] truncate px-3 py-2 font-mono text-xs text-muted-foreground">
                    {preview(entry.previousValue)}
                  </td>
                  <td className="max-w-[16rem] truncate px-3 py-2 font-mono text-xs text-muted-foreground">
                    {preview(entry.newValue)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{entry.ipAddress ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {result.total} entries — page {result.page} of {totalPages}
      </p>
    </main>
  );
}
