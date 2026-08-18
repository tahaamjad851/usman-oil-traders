import type { NextAuthConfig } from "next-auth";

import type { AppRole } from "@/types/auth";

export const authConfig = {
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
  },
  pages: {
    signIn: "/admin/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.role = user.role;
        token.username = user.username;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId as string;
      session.user.role = token.role as AppRole;
      session.user.username = token.username as string;
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
