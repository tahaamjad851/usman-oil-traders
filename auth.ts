import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "@/auth.config";
import {
  authenticateCredentials,
  LoginRateLimitError,
} from "@/lib/auth/credentials";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const forwardedFor = request.headers.get("x-forwarded-for");
        const ip = forwardedFor?.split(",")[0]?.trim() || "unknown";

        try {
          return await authenticateCredentials(credentials, ip);
        } catch (error) {
          if (error instanceof LoginRateLimitError) {
            throw error;
          }
          return null;
        }
      },
    }),
  ],
});
