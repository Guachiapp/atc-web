"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Building2, QrCode, ShieldCheck, Smartphone } from "lucide-react";
import { GuachiLogo } from "@/components/brand/GuachiLogo";
import { SiteFooter } from "@/components/brand/SiteFooter";
import { QueueDashboard } from "@/components/queue/QueueDashboard";

const featureCards = [
  {
    icon: QrCode,
    title: "QR seguro y rápido",
    text: "Ingreso en segundos con token firmado y validación server-side.",
  },
  {
    icon: Building2,
    title: "Cola por empresa",
    text: "Orden claro por taquilla/oficina con posición y ETA actualizados.",
  },
  {
    icon: ShieldCheck,
    title: "Operación confiable",
    text: "Rate limit, anti-enumeración y telemetría para soporte ATC.",
  },
];

export default function Home() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="atc-sticky-header">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="shrink-0">
            <GuachiLogo variant="white" width={186} height={46} priority />
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link
              href="https://www.guachiapp.com"
              className="hidden text-slate-300 hover:text-sa-primary-light sm:inline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Guachi Smart Access
            </Link>
            <Link
              href="/admin/login"
              className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 font-medium text-white hover:border-sa-primary/50"
            >
              Admin
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden px-4 pb-10 pt-12 sm:pt-16">
          <div className="pointer-events-none absolute inset-0 opacity-45">
            <div className="absolute -right-28 -top-24 h-72 w-72 rounded-full bg-sa-primary blur-3xl" />
            <div className="absolute -bottom-24 -left-28 h-72 w-72 rounded-full bg-sa-secondary-light blur-3xl" />
          </div>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 20 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 250 }}
            className="relative mx-auto max-w-6xl rounded-3xl border border-white/10 bg-white/[0.06] p-5 shadow-[0_20px_80px_-40px_rgba(91,135,218,0.7)] backdrop-blur-[16px] sm:p-8"
          >
            <div className="grid items-center gap-8 lg:grid-cols-[1.2fr_1fr]">
              <div>
                <p className="mb-3 inline-flex rounded-full border border-sa-primary/45 bg-sa-primary/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sa-primary-light">
                  Queue Intelligence · Mobile First
                </p>
                <h1 className="mb-4 text-3xl font-semibold leading-tight sm:text-4xl md:text-5xl">
                  Gestión ATC con experiencia fluida y enfoque operativo
                </h1>
                <p className="max-w-xl text-base text-slate-300 sm:text-lg">
                  Dashboard en tiempo real, prioridades visibles y micro-interacciones que guían la
                  atención. Diseño alineado a principios HIG: claridad, feedback continuo y foco.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <a
                    href="https://www.guachiapp.com"
                    className="inline-flex items-center gap-2 rounded-2xl bg-sa-primary px-5 py-3 text-sm font-semibold text-white hover:bg-sa-primary-dark"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Smartphone className="h-4 w-4" />
                    Ver ecosistema Guachi
                  </a>
                  <Link
                    href="/admin/login"
                    className="rounded-2xl border border-white/20 px-5 py-3 text-sm font-semibold text-slate-100 hover:border-sa-primary/60"
                  >
                    Ir al portal ATC
                  </Link>
                </div>
              </div>

              <div className="mx-auto w-full max-w-sm">
                <Image
                  src="/images/guachi_hero_image.png"
                  alt="App Guachi en el móvil"
                  width={420}
                  height={280}
                  className="w-full rounded-3xl border border-white/10 object-contain shadow-2xl"
                  priority
                />
              </div>
            </div>
          </motion.div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
          <QueueDashboard />
        </section>

        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <motion.div
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.06 } },
            }}
            initial={reduceMotion ? false : "hidden"}
            animate={reduceMotion ? undefined : "show"}
            className="grid gap-3 sm:grid-cols-3"
          >
            {featureCards.map(({ icon: Icon, title, text }) => (
              <motion.article
                key={title}
                variants={{
                  hidden: { opacity: 0, y: 10 },
                  show: { opacity: 1, y: 0 },
                }}
                whileHover={reduceMotion ? undefined : { y: -2, scale: 1.02 }}
                transition={{ type: "spring", damping: 25, stiffness: 250 }}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-[16px]"
              >
                <div className="mb-3 inline-flex rounded-xl bg-sa-primary/15 p-2 text-sa-primary-light">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-white">{title}</h3>
                <p className="text-sm text-slate-300">{text}</p>
              </motion.article>
            ))}
          </motion.div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
