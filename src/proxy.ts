import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { NextRequestWithAuth } from "next-auth/middleware";

export default withAuth(
  function proxy(req: NextRequestWithAuth) {
    const { pathname } = req.nextUrl;
    const inApplicationNamespace =
      pathname === "/app" || pathname.startsWith("/app/");
    const applicationPath = inApplicationNamespace
      ? pathname.slice(4) || "/"
      : pathname;
    const appPrefix = inApplicationNamespace ? "/app" : "";
    const token = req.nextauth.token;

    if (applicationPath === "/login") return NextResponse.next();
    if (!token) return NextResponse.redirect(new URL(`${appPrefix}/login`, req.url));

    const role = token.role as string;

    // Technicians get their own dashboard + tasks (+ notifications).
    if (role === "TECHNICIAN") {
      if (
        !applicationPath.startsWith("/tasks") &&
        !applicationPath.startsWith("/dashboard") &&
        !applicationPath.startsWith("/notifications")
      ) {
        return NextResponse.redirect(new URL(`${appPrefix}/tasks`, req.url));
      }
      return NextResponse.next();
    }

    // Staff (Supervisor / Manager / Admin) get every management page, but not
    // the technician task pages. Data is scoped to their branch server-side.
    if (applicationPath.startsWith("/tasks")) {
      return NextResponse.redirect(new URL(`${appPrefix}/dashboard`, req.url));
    }

    return NextResponse.next();
  },
  {
    pages: {
      signIn: "/app/login",
    },
    callbacks: {
      authorized: ({ token, req }) =>
        req.nextUrl.pathname === "/app/login" || !!token,
    },
  }
);

export const config = {
  // Only internal application routes require authentication. Public website
  // routes bypass this proxy and remain crawlable.
  matcher: [
    "/dashboard/:path*",
    "/customers/:path*",
    "/appointments/:path*",
    "/schedule/:path*",
    "/teams/:path*",
    "/users/:path*",
    "/inventory/:path*",
    "/branches/:path*",
    "/payments/:path*",
    "/tasks/:path*",
    "/notifications/:path*",
    "/website-leads/:path*",
    "/app/:path*",
  ],
};
