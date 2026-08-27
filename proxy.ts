import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

const adminOnlyPrefixes = [
  "/admin/purchases",
  "/admin/suppliers",
  "/admin/staff",
  "/admin/settings",
  "/admin/audit-log",
  "/admin/reports",
  "/admin/expenses",
  "/admin/products",
  // Aggregate cross-channel reconciliation totals — same "owner-only revenue figure" boundary as
  // Phase 12's reporting. Per-order payment history (on /admin/orders/[id]) stays open to staff.
  "/admin/payments",
  // Supplier/buyer running balances — same owner-only financial-ledger boundary as payments.
  "/admin/khata",
];

export default auth((request) => {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  if (!request.auth) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  if (
    adminOnlyPrefixes.some((prefix) => pathname.startsWith(prefix)) &&
    request.auth.user.role !== "SUPER_ADMIN"
  ) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*"],
};
