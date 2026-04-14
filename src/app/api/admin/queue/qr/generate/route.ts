import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import QRCode from "qrcode";
import { requireAdminAuth } from "@/lib/admin-route-guard";
import { generateQREntryToken } from "@/lib/queue-qr-tokens";

const Schema = z.object({
  condominioId: z.number().int().positive(),
  empresaId: z.number().int().positive().nullable().optional(),
  empresaLabel: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (auth) return auth;

  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Datos inválidos" }, { status: 400 });
  }

  const token = generateQREntryToken({
    condominioId: parsed.data.condominioId,
    empresaId: parsed.data.empresaId ?? null,
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const url = `${baseUrl}/q/${encodeURIComponent(token)}`;
  const qrCodeDataUrl = await QRCode.toDataURL(url, { width: 320, margin: 2 });

  return NextResponse.json({
    success: true,
    data: {
      token,
      url,
      qrCodeDataUrl,
      condominioId: parsed.data.condominioId,
      empresaId: parsed.data.empresaId ?? null,
      empresaLabel: parsed.data.empresaLabel ?? null,
    },
  });
}
