"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { LockKeyhole } from "lucide-react";
import { GuachiLogo } from "@/components/brand/GuachiLogo";

interface AdminLoginProps {
  onLoginSuccess: () => void;
}

export function AdminLogin({ onLoginSuccess }: AdminLoginProps) {
  const reduceMotion = useReducedMotion();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Las credenciales se envían para que el browser acepte la cookie Set-Cookie de la respuesta.
        credentials: "same-origin",
        body: JSON.stringify({ password }),
      });
      const json = await response.json();
      if (!json.success) throw new Error(json.error || "Credenciales inválidas");
      // El token ya NO se guarda en localStorage; el browser almacena la cookie HttpOnly automáticamente.
      onLoginSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de autenticación");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <motion.form
        onSubmit={handleSubmit}
        initial={reduceMotion ? false : { opacity: 0, y: 20 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 250 }}
        className="w-full max-w-md rounded-3xl border border-white/12 bg-white/[0.06] p-8 shadow-[0_20px_80px_-40px_rgba(91,135,218,0.85)] backdrop-blur-[16px]"
      >
        <div className="mb-6 flex justify-center">
          <GuachiLogo variant="white" width={200} height={50} priority />
        </div>
        <p className="mb-1 flex items-center justify-center gap-1.5 text-center text-xs font-semibold uppercase tracking-wide text-sa-primary-light">
          <LockKeyhole className="h-3.5 w-3.5" />
          Administración segura
        </p>
        <h1 className="mb-2 text-center text-2xl font-bold text-white">Guachi ATC</h1>
        <p className="mb-6 text-center text-slate-300">
          Inicia sesión para generar QR firmados.
        </p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña de administrador"
          className="mb-3 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white outline-none ring-sa-primary/60 placeholder:text-slate-500 focus:ring-2"
        />
        {error ? <p className="mb-3 text-sm text-sa-state-error">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="h-11 w-full rounded-xl bg-sa-primary text-sa-text-inverted font-semibold disabled:opacity-50"
        >
          {loading ? "Verificando..." : "Ingresar"}
        </button>
      </motion.form>
    </main>
  );
}
