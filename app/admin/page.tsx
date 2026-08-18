import { redirect } from "next/navigation";

import { getAuthContext } from "@/lib/auth/session";
import { PasswordChangeRequiredError } from "@/lib/auth/guard";

import { LogoutButton } from "./logout-button";

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

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <section className="space-y-4 text-center">
        <div>
          <h1 className="text-2xl font-semibold">Usman Oil Traders</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as {ctx.username} ({ctx.role})
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Phase 3 authentication and roles are configured.
        </p>
        <LogoutButton />
      </section>
    </main>
  );
}
