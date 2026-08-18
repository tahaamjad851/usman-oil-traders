import type { DefaultSession } from "next-auth";

import type { AppRole } from "@/types/auth";

declare module "next-auth" {
  interface User {
    role: AppRole;
    username: string;
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: AppRole;
      username: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    role: AppRole;
    username: string;
  }
}
