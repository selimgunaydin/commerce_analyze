import { NextResponse } from "next/server";
import { auth } from "@/auth";

const publicRoutes = new Set(["/", "/login"]);

export default auth((request) => {
  const { nextUrl } = request;
  const isAuthenticated = Boolean(request.auth);
  const isAuthApi = nextUrl.pathname.startsWith("/api/auth");
  const isPublicRoute = publicRoutes.has(nextUrl.pathname);

  if (isAuthApi) {
    return NextResponse.next();
  }

  if (!isAuthenticated && !isPublicRoute) {
    if (nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", `${nextUrl.pathname}${nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && nextUrl.pathname === "/login") {
    return NextResponse.redirect(new URL("/audits", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|storage|.*\\..*).*)"]
};
