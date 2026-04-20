import { NextRequest, NextResponse } from "next/server";
import { destroyAdminToken } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("admin_token")?.value;
  if (token) {
    await destroyAdminToken(token);
  }

  const response = NextResponse.json({ success: true });
  // Eliminar la cookie expirando inmediatamente.
  response.cookies.set("admin_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
