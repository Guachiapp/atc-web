import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-sa-secondary-dark py-10 text-center">
      <p className="text-sm font-medium text-slate-200">
        Guachi Smart Access — ATC
      </p>
      <p className="mt-2 text-xs text-slate-400">
        Parte del ecosistema{" "}
        <Link
          href="https://www.guachiapp.com"
          className="text-sa-primary-light hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          guachiapp.com
        </Link>
      </p>
    </footer>
  );
}
