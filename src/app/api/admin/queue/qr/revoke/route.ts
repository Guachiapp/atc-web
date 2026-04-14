import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAuth } from "@/lib/admin-route-guard";
import { revokeQREntryToken } from "@/lib/queue-qr-tokens";

const Schema = z.object({
  token: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (auth) return auth;

  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Token inválido" }, { status: 400 });
  }

  const revoked = await revokeQREntryToken(parsed.data.token);
  if (!revoked) {
    return NextResponse.json({ success: false, error: "No se pudo revocar el token" }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
