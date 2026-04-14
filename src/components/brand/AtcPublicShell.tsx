import Link from "next/link";
import { GuachiLogo } from "@/components/brand/GuachiLogo";
import { SiteFooter } from "@/components/brand/SiteFooter";

type AtcPublicShellProps = {
  children: React.ReactNode;
};

export function AtcPublicShell({ children }: AtcPublicShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="atc-sticky-header">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="shrink-0 transition opacity-90 hover:opacity-100">
            <GuachiLogo variant="white" width={168} height={42} priority />
          </Link>
          <span className="rounded-full border border-sa-primary/35 bg-sa-primary/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-sa-primary-light">
            Turnos ATC
          </span>
        </div>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-6">
        {children}
      </div>
      <SiteFooter />
    </div>
  );
}
