import { NextRequest, NextResponse } from "next/server";
import { isAdminSessionValid } from "@/lib/admin-auth";

export async function requireAdminAuth(request: NextRequest): Promise<NextResponse | null> {
  const auth = request.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
  }

  const token = auth.slice(7);
  if (!(await isAdminSessionValid(token))) {
    return NextResponse.json({ success: false, error: "Sesión inválida o expirada" }, { status: 401 });
  }
  return null;
}
