import { NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const token = request.cookies.get("prepkit_session")?.value;
  if (!token) return NextResponse.redirect(new URL("/login", request.url));

  // Browser requests use NEXT_PUBLIC_API_BASE_URL. Server-side middleware inside
  // Docker must use the private service URL instead (for example, http://backend:8000).
  const configuredBackend = (
    process.env.BACKEND_INTERNAL_URL
    ?? process.env.NEXT_PUBLIC_API_BASE_URL
    ?? (process.env.NODE_ENV === "development" ? "http://localhost:8000" : undefined)
  )?.trim();
  const backendUrl = configuredBackend
    ? /^(https?:)?\/\//i.test(configuredBackend) ? configuredBackend.replace(/\/+$/, "") : `http://${configuredBackend.replace(/\/+$/, "")}`
    : process.env.NEXT_PUBLIC_API_BASE_URL === "" ? request.nextUrl.origin : "";
  if (!backendUrl) return NextResponse.redirect(new URL("/login", request.url));

  try {
    const response = await fetch(`${backendUrl}/api/auth/me`, {
      headers: { cookie: `prepkit_session=${token}` },
      cache: "no-store",
    });
    if (response.ok) return NextResponse.next();
  } catch {
    // Fail closed: a protected page must not be served when the session cannot be verified.
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("expired", "1");
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!api|login|register|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
