export type AppRole = "SUPER_ADMIN" | "STAFF";

export type AuthContext = {
  userId: string;
  role: AppRole;
  username: string;
  ip?: string;
  mustChangePassword: boolean;
};
