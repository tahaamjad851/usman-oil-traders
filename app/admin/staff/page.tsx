import { redirect } from "next/navigation";

import { PasswordChangeRequiredError } from "@/lib/auth/guard";
import { getAuthContext } from "@/lib/auth/session";
import { listStaffAccounts } from "@/lib/services/staff.service";

import { StaffForm } from "./staff-form";
import { StaffStatusButton } from "./staff-status-button";

type StaffRow = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string | Date;
};

export default async function AdminStaffPage() {
  let ctx: Awaited<ReturnType<typeof getAuthContext>>;

  try {
    ctx = await getAuthContext();
  } catch (error) {
    if (error instanceof PasswordChangeRequiredError) {
      redirect("/admin/change-password");
    }
    redirect("/admin/login");
  }

  // requireRole(SUPER_ADMIN) inside listStaffAccounts is the real gate — proxy.ts already
  // blocks /admin/staff for non-admin roles, same defense-in-depth pattern as every other
  // owner-only admin section.
  const staff = (await listStaffAccounts(ctx)) as StaffRow[];

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Staff</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as {ctx.username} (SUPER_ADMIN)
        </p>
      </div>

      {staff.length === 0 ? (
        <p className="text-sm text-muted-foreground">No staff accounts yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Username</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {staff.map((account) => (
                <tr key={account.id} className="border-t">
                  <td className="px-3 py-2">{account.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{account.username}</td>
                  <td className="px-3 py-2">{account.role}</td>
                  <td className="px-3 py-2">
                    {account.isActive ? (
                      "Active"
                    ) : (
                      <span className="text-destructive">Inactive</span>
                    )}
                    {account.mustChangePassword ? (
                      <span className="ml-2 text-xs text-muted-foreground">(password change pending)</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(account.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <StaffStatusButton staffId={account.id} isActive={account.isActive} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium">Create a staff account</h2>
        <StaffForm />
      </section>
    </main>
  );
}
