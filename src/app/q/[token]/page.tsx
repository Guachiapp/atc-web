import Link from "next/link";
import { AtcPublicShell } from "@/components/brand/AtcPublicShell";
import { GuachiLogo } from "@/components/brand/GuachiLogo";
import { QueueJoinFlow } from "@/components/queue/QueueJoinFlow";
import { validateQREntryToken } from "@/lib/queue-qr-tokens";

export default async function QueueEntryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const decodedToken = decodeURIComponent(token);
  const valid = await validateQREntryToken(decodedToken);

  if (!valid) {
    return (
      <AtcPublicShell>
        <section className="w-full max-w-lg rounded-3xl border border-sa-state-error/35 bg-white/[0.06] p-8 shadow-[0_20px_70px_-38px_rgba(239,68,68,0.8)] backdrop-blur-[16px]">
          <div className="mb-6 flex justify-center">
            <GuachiLogo variant="white" width={180} height={45} />
          </div>
          <h1 className="mb-3 text-center text-2xl font-bold text-sa-state-error">
            QR inválido o expirado
          </h1>
          <p className="text-center text-slate-200">
            Solicita al personal de la empresa un código QR vigente o vuelve al inicio.
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              href="/"
              className="rounded-xl bg-sa-primary px-6 py-3 text-sm font-semibold text-white hover:bg-sa-primary-dark"
            >
              Volver al inicio
            </Link>
          </div>
        </section>
      </AtcPublicShell>
    );
  }

  return (
    <AtcPublicShell>
      <QueueJoinFlow qrToken={decodedToken} />
    </AtcPublicShell>
  );
}
