import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

const PARTNER_ALLOWED = [
  "/",
  "/report",
  "/api/projection",
  "/api/summary",
  "/api/accounts",
  "/api/ledger",
  "/api/balance-forecast",
  "/api/loans",
  "/api/auth",
];

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    if (token?.role === "PARTNER") {
      const allowed = PARTNER_ALLOWED.some((p) => pathname === p || pathname.startsWith(p + "/"));
      if (!allowed) {
        return NextResponse.redirect(new URL("/", req.url));
      }
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: { signIn: "/login" },
  },
);

export const config = {
  matcher: [
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)",
  ],
};
