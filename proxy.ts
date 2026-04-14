import { NextRequest, NextResponse } from "next/server";
import { getSecurityHeaders } from "./src/lib/security-headers";
import { checkRateLimit } from "./src/lib/rate-limiter";

function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const headers = getSecurityHeaders();
  Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));

  if (request.nextUrl.pathname.startsWith("/api/")) {
    const ip = clientIp(request);
    const isSensitive =
      request.nextUrl.pathname.includes("/queue/generar-ticket") ||
      request.nextUrl.pathname.includes("/admin/auth/login");
    const result = checkRateLimit(`mw:${ip}:${isSensitive ? "s" : "n"}`, {
      maxRequests: isSensitive ? 30 : 120,
      windowSeconds: 60,
    });
    if (!result.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(result.retryAfter) } },
      );
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
