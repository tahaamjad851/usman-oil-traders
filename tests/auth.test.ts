import { describe, expect, it } from "vitest";

import {
  authenticateCredentials,
  LoginRateLimitError,
  type CredentialsDependencies,
} from "@/lib/auth/credentials";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createLoginRateLimiter, type LoginRateLimitStore } from "@/lib/auth/rate-limit";

const activeUser = {
  id: "user-1",
  name: "Owner",
  username: "owner",
  passwordHash: "stored-hash",
  role: "SUPER_ADMIN" as const,
  isActive: true,
};

function dependencies(overrides: Partial<CredentialsDependencies> = {}): CredentialsDependencies {
  return {
    checkRateLimit: async () => true,
    recordFailure: async () => undefined,
    resetAttempts: async () => undefined,
    findUser: async () => activeUser,
    verify: async () => true,
    recordSuccess: async () => undefined,
    recordKnownFailure: async () => undefined,
    ...overrides,
  };
}

describe("password hashing", () => {
  it("hashes and verifies argon2id passwords", async () => {
    const hash = await hashPassword("StrongPassword123");
    await expect(verifyPassword(hash, "StrongPassword123")).resolves.toBe(true);
    await expect(verifyPassword(hash, "incorrect-password")).resolves.toBe(false);
  });
});

describe("credentials authentication", () => {
  it("accepts correct credentials and records a successful login", async () => {
    let successes = 0;
    const result = await authenticateCredentials(
      { username: " OWNER ", password: "correct" },
      "127.0.0.1",
      dependencies({ recordSuccess: async () => void successes++ }),
    );

    expect(result).toMatchObject({ id: "user-1", role: "SUPER_ADMIN" });
    expect(result).not.toHaveProperty("passwordHash");
    expect(successes).toBe(1);
  });

  it("rejects an incorrect password and records a failure", async () => {
    let failures = 0;
    const result = await authenticateCredentials(
      { username: "owner", password: "wrong" },
      "127.0.0.1",
      dependencies({
        verify: async () => false,
        recordFailure: async () => void failures++,
      }),
    );

    expect(result).toBeNull();
    expect(failures).toBe(1);
  });

  it("rejects inactive staff even with a correct password", async () => {
    const result = await authenticateCredentials(
      { username: "staff", password: "correct" },
      "127.0.0.1",
      dependencies({
        findUser: async () => ({ ...activeUser, role: "STAFF", isActive: false }),
      }),
    );

    expect(result).toBeNull();
  });

  it("rejects a locked-out username before a database lookup", async () => {
    let lookedUp = false;
    await expect(
      authenticateCredentials(
        { username: "owner", password: "wrong" },
        "127.0.0.1",
        dependencies({
          checkRateLimit: async () => false,
          findUser: async () => {
            lookedUp = true;
            return activeUser;
          },
        }),
      ),
    ).rejects.toBeInstanceOf(LoginRateLimitError);
    expect(lookedUp).toBe(false);
  });
});

describe("login rate limiter", () => {
  it("locks after five failures and resets after a successful login", async () => {
    const values = new Map<string, number>();
    const store: LoginRateLimitStore = {
      get: async (key) => values.get(key)?.toString() ?? null,
      incr: async (key) => {
        const next = (values.get(key) ?? 0) + 1;
        values.set(key, next);
        return next;
      },
      expire: async () => 1,
      del: async (key) => Number(values.delete(key)),
    };
    const limiter = createLoginRateLimiter(store);

    for (let attempt = 0; attempt < 5; attempt++) {
      await limiter.recordFailure("127.0.0.1", "owner");
    }
    await expect(limiter.check("127.0.0.1", "owner")).resolves.toBe(false);
    await limiter.reset("127.0.0.1", "owner");
    await expect(limiter.check("127.0.0.1", "owner")).resolves.toBe(true);
  });
});
