"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Bell, QrCode, Radio, Smartphone, ShieldCheck } from "lucide-react";
import { GuachiLogo } from "@/components/brand/GuachiLogo";
import { SiteFooter } from "@/components/brand/SiteFooter";
import { QueueDashboard } from "@/components/queue/QueueDashboard";

const featureCards = [
  {
    icon: QrCode,
    title: "Ingreso por QR en recepción",
    text: "El visitante abre el enlace del código (token firmado). Sesión de cola efímera, enlazada al dispositivo cuando aplica.",
  },
  {
    icon: Radio,
    title: "Cola en vivo y turno",
    text: "Vista previa de la fila con datos de la API Centinela; canal en tiempo real (SSE) mientras esperas tu número.",
  },
  {
    icon: Bell,
    title: "Avisos en el navegador",
    text: "Avisos cuando te llaman o falta poco; puedes activarlos desde la pantalla de tu turno.",
  },
  {
    icon: ShieldCheck,
    title: "Protección y operación",
    text: "CAPTCHA adaptativo, rate limiting y cabeceras internas hacia el backend; pensado para integrarse con el resto de productos Guachi.",
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
              className="text-slate-300 hover:text-sa-primary-light"
              target="_blank"
              rel="noopener noreferrer"
            >
              Guachi
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
                  Cola digital · Guachi
                </p>
                <h1 className="mb-4 text-3xl font-semibold leading-tight sm:text-4xl md:text-5xl">
                  Turnos y filas de atención, desde el QR hasta el aviso en el móvil
                </h1>
                <p className="max-w-xl text-base text-slate-300 sm:text-lg">
                  Los visitantes entran con el código en recepción, eligen empresa cuando el QR no fija una
                  sola, revisan la cola, toman su número y pueden activar notificaciones para saber cuándo los
                  llaman, sin depender de la ventana del navegador abierta.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <a
                    href="https://www.guachiapp.com"
                    className="inline-flex items-center gap-2 rounded-2xl bg-sa-primary px-5 py-3 text-sm font-semibold text-white hover:bg-sa-primary-dark"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Smartphone className="h-4 w-4" />
                    Conocer Guachi
                  </a>
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
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
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
