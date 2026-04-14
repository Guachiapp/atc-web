"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { GuachiLogo } from "@/components/brand/GuachiLogo";
import { SiteFooter } from "@/components/brand/SiteFooter";
import { QueueQRGenerator } from "@/components/admin/QueueQRGenerator";

export default function AdminQueueQrGeneratorPage() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (!token) {
      router.replace("/admin/login");
      return;
    }

    fetch("/api/admin/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (!json.valid) {
          localStorage.removeItem("admin_token");
          router.replace("/admin/login");
          return;
        }
        setReady(true);
      })
      .catch(() => router.replace("/admin/login"));
  }, [router]);

  if (!ready) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4">
        <GuachiLogo variant="white" width={160} height={40} priority />
        <p className="mt-6 text-slate-300">Validando sesión de administrador...</p>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="atc-sticky-header">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="shrink-0">
            <GuachiLogo variant="white" width={160} height={40} />
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-slate-300 hover:text-sa-primary-light"
          >
            Inicio
          </Link>
        </div>
      </header>
      <main className="flex-1 p-6 sm:p-10">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 250 }}
          className="mx-auto max-w-4xl"
        >
          <QueueQRGenerator />
        </motion.div>
      </main>
      <SiteFooter />
    </div>
  );
}
