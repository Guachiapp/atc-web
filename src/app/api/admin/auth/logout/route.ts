import { NextRequest, NextResponse } from "next/server";
import { destroyAdminToken } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    await destroyAdminToken(auth.slice(7));
  }
  return NextResponse.json({ success: true });
}
