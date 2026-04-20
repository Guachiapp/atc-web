"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Building2, QrCode, Sparkles } from "lucide-react";
import { GuachiLogo } from "@/components/brand/GuachiLogo";
import type { EmpresaUnidad } from "@/types/queue";

interface GeneratedQR {
  token: string;
  url: string;
  qrCodeDataUrl: string;
  condominioId: number;
  empresaId: number | null;
  empresaLabel: string | null;
}

export function QueueQRGenerator() {
  const reduceMotion = useReducedMotion();
  const [condominioId, setCondominioId] = useState("");
  const [empresaId, setEmpresaId] = useState("");
  const [empresaLabel, setEmpresaLabel] = useState("");
  const [empresas, setEmpresas] = useState<EmpresaUnidad[] | null>(null);
  const [loadingUnidades, setLoadingUnidades] = useState(false);
  const [unidadesError, setUnidadesError] = useState("");
  const [generated, setGenerated] = useState<GeneratedQR | null>(null);
  const [error, setError] = useState("");

  /** Las rutas admin leen el token de la cookie HttpOnly — no se necesita header explícito. */
  const jsonHeaders = (): HeadersInit => ({ "Content-Type": "application/json" });

  const fetchEmpresas = async () => {
    setUnidadesError("");
    setEmpresas(null);
    const id = Number(condominioId);
    if (!condominioId || Number.isNaN(id) || id < 1) {
      setUnidadesError("Indica un ID de condominio válido");
      return;
    }
    setLoadingUnidades(true);
    try {
      const response = await fetch(`/api/admin/queue/unidades?condominioId=${id}`, {
        credentials: "same-origin",
      });
      const json = await response.json();
      if (!json.success) {
        setUnidadesError(json.error || "No se pudieron cargar las empresas");
        return;
      }
      const list = json.data.empresasPorOficina as EmpresaUnidad[];
      setEmpresas(list);
      setEmpresaId("");
      setEmpresaLabel("");
    } catch {
      setUnidadesError("Error de red al consultar empresas");
    } finally {
      setLoadingUnidades(false);
    }
  };

  const onEmpresaSelect = (value: string) => {
    if (value === "") {
      setEmpresaId("");
      setEmpresaLabel("");
      return;
    }
    const [uid, rid] = value.split(":");
    const row = empresas?.find(
      (e) => String(e.userId) === uid && String(e.userRolId) === rid,
    );
    if (row) {
      setEmpresaId(String(row.userId));
      setEmpresaLabel(`${row.empresa} · ${row.ubicacion}`);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setGenerated(null);

    const response = await fetch("/api/admin/queue/qr/generate", {
      method: "POST",
      headers: jsonHeaders(),
      credentials: "same-origin",
      body: JSON.stringify({
        condominioId: Number(condominioId),
        empresaId: empresaId ? Number(empresaId) : null,
        empresaLabel: empresaLabel || undefined,
      }),
    });
    const json = await response.json();
    if (!json.success) {
      setError(json.error || "No se pudo generar el QR");
      return;
    }
    setGenerated(json.data);
  };

  const handleRevoke = async () => {
    if (!generated) return;
    const response = await fetch("/api/admin/queue/qr/revoke", {
      method: "POST",
      headers: jsonHeaders(),
      credentials: "same-origin",
      body: JSON.stringify({ token: generated.token }),
    });
    const json = await response.json();
    if (json.success) {
      setGenerated(null);
    } else {
      setError(json.error || "No se pudo revocar el QR");
    }
  };

  const selectValue =
    empresaId && empresas?.some((e) => e.userId === Number(empresaId))
      ? (() => {
          const row = empresas.find((e) => e.userId === Number(empresaId));
          return row ? `${row.userId}:${row.userRolId}` : "";
        })()
      : "";

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 250 }}
      className="rounded-3xl border border-white/12 bg-sa-secondary/80 p-6 shadow-[0_20px_70px_-38px_rgba(91,135,218,0.95)] backdrop-blur-[16px] sm:p-8"
    >
      <div className="mb-6 flex flex-col items-center border-b border-white/10 pb-6 text-center sm:flex-row sm:items-start sm:text-left">
        <div className="mb-4 shrink-0 sm:mb-0 sm:mr-6">
          <GuachiLogo variant="white" width={180} height={45} />
        </div>
        <div>
          <p className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-sa-primary-light">
            <Sparkles className="h-3.5 w-3.5" />
            Herramienta interna
          </p>
          <h2 className="text-2xl font-bold text-white">Generador de QR ATC</h2>
          <p className="mt-1 text-slate-300">
            Crea QR firmados por condominio y empresa para recepción.
          </p>
        </div>
      </div>

      <form onSubmit={handleGenerate} className="space-y-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div className="sm:col-span-1">
            <label className="mb-1 block text-xs font-medium text-slate-400">Condominio ID</label>
            <input
              type="number"
              min={1}
              value={condominioId}
              onChange={(e) => {
                setCondominioId(e.target.value);
                setEmpresas(null);
                setUnidadesError("");
              }}
              placeholder="Ej. 1"
              className="w-full rounded-xl border border-white/20 bg-sa-secondary-dark/70 px-4 py-3 text-white outline-none ring-sa-primary/60 placeholder:text-slate-500 focus:ring-2"
              required
            />
          </div>
          <div className="sm:col-span-2 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => void fetchEmpresas()}
              disabled={loadingUnidades}
              className="h-12 whitespace-nowrap rounded-xl border border-sa-primary/60 bg-sa-primary/10 px-4 font-semibold text-sa-primary-light disabled:opacity-50"
            >
              {loadingUnidades ? "Consultando…" : "Consultar empresas"}
            </button>
          </div>
        </div>

        {unidadesError ? <p className="text-sm text-sa-state-error">{unidadesError}</p> : null}

        {empresas && empresas.length > 0 ? (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 250 }}
          >
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Empresa / ventanilla (opcional)
            </label>
            <select
              value={selectValue}
              onChange={(e) => onEmpresaSelect(e.target.value)}
              className="w-full rounded-xl border border-white/20 bg-sa-secondary-dark/70 px-4 py-3 text-white outline-none ring-sa-primary/60 focus:ring-2"
            >
              <option value="">Todas — QR sin filtrar por empresa</option>
              {empresas.map((row) => (
                <option key={`${row.userId}-${row.userRolId}`} value={`${row.userId}:${row.userRolId}`}>
                  {row.empresa} — {row.ubicacion} (user {row.userId})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-400">
              El QR limita el flujo a esa empresa; el valor enviado al token es el{" "}
              <code className="text-slate-200">user_id</code> del API.
            </p>
          </motion.div>
        ) : empresas && empresas.length === 0 ? (
          <p className="text-sm text-slate-300">No hay empresas registradas para este condominio.</p>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Empresa ID (manual, opcional)
            </label>
            <input
              type="number"
              min={1}
              value={empresaId}
              onChange={(e) => setEmpresaId(e.target.value)}
              placeholder="Mismo user_id que en Centinela"
              className="w-full rounded-xl border border-white/20 bg-sa-secondary-dark/70 px-4 py-3 text-white outline-none ring-sa-primary/60 placeholder:text-slate-500 focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Etiqueta (opcional)</label>
            <input
              value={empresaLabel}
              onChange={(e) => setEmpresaLabel(e.target.value)}
              placeholder="Solo referencia al imprimir"
              className="w-full rounded-xl border border-white/20 bg-sa-secondary-dark/70 px-4 py-3 text-white outline-none ring-sa-primary/60 placeholder:text-slate-500 focus:ring-2"
            />
          </div>
        </div>

        <button className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sa-primary text-sa-text-inverted font-semibold">
          <QrCode className="h-4 w-4" />
          Generar QR firmado
        </button>
      </form>

      {error ? <p className="text-sm text-sa-state-error mb-4">{error}</p> : null}

      {generated ? (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 250 }}
          className="rounded-2xl border border-sa-primary/35 bg-sa-secondary-dark/85 p-4"
        >
          <img
            src={generated.qrCodeDataUrl}
            alt="QR ATC"
            className="mb-4 h-56 w-56 rounded-lg border border-white/25 bg-white p-2"
          />
          <p className="mb-1 break-all text-sm text-slate-100">{generated.url}</p>
          <p className="mb-3 inline-flex items-center gap-1 text-xs text-slate-300">
            <Building2 className="h-3.5 w-3.5" />
            Condominio {generated.condominioId}
            {generated.empresaId ? ` · Empresa ${generated.empresaId}` : " · Todas las empresas"}
          </p>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(generated.url)}
              className="h-10 rounded-lg border border-white/30 px-4 text-sm font-semibold text-white"
            >
              Copiar URL
            </button>
            <button
              type="button"
              onClick={handleRevoke}
              className="h-10 px-4 rounded-lg bg-sa-state-error text-white text-sm font-semibold"
            >
              Revocar token
            </button>
          </div>
        </motion.div>
      ) : null}
    </motion.section>
  );
}
