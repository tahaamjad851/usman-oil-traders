import { describe, expect, it } from "vitest";

import { getAuthContext } from "@/lib/auth/session";
import { PasswordChangeRequiredError, UnauthorizedError } from "@/lib/auth/guard";

const activeUser = {
  id: "user-1",
  username: "staff",
  role: "STAFF" as const,
  isActive: true,
  mustChangePassword: false,
};

describe("getAuthContext — session re-verification (Phase 13)", () => {
  it("rejects when there is no session at all", async () => {
    await expect(
      getAuthContext(undefined, { readSession: async () => null, readUser: async () => activeUser }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("builds a normal AuthContext for an active user with a valid session", async () => {
    const ctx = await getAuthContext(
      { ip: "127.0.0.1" },
      { readSession: async () => ({ user: { id: "user-1" } }), readUser: async () => activeUser },
    );
    expect(ctx).toMatchObject({ userId: "user-1", role: "STAFF", ip: "127.0.0.1" });
  });

  it("rejects a still-valid session token for a user who has since been deactivated — re-read from the DB, not trusted off the token", async () => {
    await expect(
      getAuthContext(undefined, {
        readSession: async () => ({ user: { id: "user-1" } }), // token itself is still "valid"
        readUser: async () => ({ ...activeUser, isActive: false }), // but the DB now says deactivated
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects when the user id from the session no longer exists in the database at all", async () => {
    await expect(
      getAuthContext(undefined, {
        readSession: async () => ({ user: { id: "deleted-user" } }),
        readUser: async () => null,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("requires a password change before returning a usable context, unless explicitly allowed", async () => {
    const deps = {
      readSession: async () => ({ user: { id: "user-1" } }),
      readUser: async () => ({ ...activeUser, mustChangePassword: true }),
    };

    await expect(getAuthContext(undefined, deps)).rejects.toBeInstanceOf(PasswordChangeRequiredError);
    await expect(getAuthContext({ allowPasswordChange: true }, deps)).resolves.toMatchObject({
      mustChangePassword: true,
    });
  });
});
