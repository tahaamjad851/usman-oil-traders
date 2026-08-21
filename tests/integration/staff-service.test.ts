import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { createStaffAccount, deactivateStaffAccount } from "@/lib/services/staff.service";
import { getAuthContext } from "@/lib/auth/session";
import { ForbiddenError, ValidationError } from "@/lib/auth/guard";
import { createTestUser } from "./fixtures";

// staff.service.ts is the one service in the codebase that calls the real `prisma` directly with
// no injectable client parameter (every other service follows a DI pattern specifically so it can
// be unit tested against a fake client) — which is exactly why it had zero test coverage before
// this phase. Rather than refactoring its signatures just to make it mockable, this exercises it
// against the same real, disposable database the rest of this integration suite uses.
describe("staff.service.ts against a real database (Phase 14)", () => {
  it("SUPER_ADMIN can create a staff account; STAFF is rejected", async () => {
    const admin = await createTestUser("SUPER_ADMIN");
    const staff = await createTestUser("STAFF");

    const created = await createStaffAccount(admin, {
      name: "New Hire",
      username: `new-hire-${Date.now()}`,
      temporaryPassword: "TempPass!234567",
    });
    expect(created).toMatchObject({ role: "STAFF", mustChangePassword: true });

    await expect(
      createStaffAccount(staff, {
        name: "Blocked",
        username: `blocked-${Date.now()}`,
        temporaryPassword: "TempPass!234567",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("deactivating a staff account immediately invalidates their session on the next request", async () => {
    const admin = await createTestUser("SUPER_ADMIN");
    const staff = await createTestUser("STAFF");

    // Confirm the account works before deactivation, using the real getAuthContext DB re-read
    // (Phase 13 built this re-check; this is the first time it's been exercised against a real
    // database rather than a mocked readUser).
    const ctxBefore = await getAuthContext(undefined, {
      readSession: async () => ({ user: { id: staff.userId } }),
    });
    expect(ctxBefore.userId).toBe(staff.userId);

    await deactivateStaffAccount(admin, staff.userId);

    await expect(
      getAuthContext(undefined, { readSession: async () => ({ user: { id: staff.userId } }) }),
    ).rejects.toThrow();

    const row = await prisma.user.findUniqueOrThrow({ where: { id: staff.userId } });
    expect(row.isActive).toBe(false);
  });

  it("a SUPER_ADMIN cannot deactivate their own account, and STAFF cannot deactivate anyone", async () => {
    const admin = await createTestUser("SUPER_ADMIN");
    const staff = await createTestUser("STAFF");
    const otherStaff = await createTestUser("STAFF");

    await expect(deactivateStaffAccount(admin, admin.userId)).rejects.toBeInstanceOf(ValidationError);
    await expect(deactivateStaffAccount(staff, otherStaff.userId)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
