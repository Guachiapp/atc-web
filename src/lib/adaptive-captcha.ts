import { rtIncrWithExpiry } from "@/lib/redis-runtime";

type Decision = {
  allowed: boolean;
  requiresCaptcha: boolean;
  score: number;
  reason?: string;
};

async function verifyTurnstileToken(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return process.env.NODE_ENV !== "production" && token === "dev-bypass";
  }

  try {
    const form = new URLSearchParams();
    form.append("secret", secret);
    form.append("response", token);
    if (ip) form.append("remoteip", ip);
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const json = (await response.json()) as { success?: boolean };
    return Boolean(json.success);
  } catch (error) {
    console.error("[adaptive-captcha] verify error", error);
    return false;
  }
}

export async function enforceAdaptiveCaptcha(input: {
  ip: string;
  userAgent: string;
  action: "session_init" | "ticket_generate";
  captchaToken?: string;
}): Promise<Decision> {
  const key = `atc:risk:${input.action}:${input.ip || "unknown"}`;
  const attempts = await rtIncrWithExpiry(key, 300);

  let score = Math.min(100, attempts * 8);
  const ua = input.userAgent.toLowerCase();
  if (!ua || ua === "unknown") score += 10;
  if (ua.includes("bot") || ua.includes("crawler") || ua.includes("spider")) score += 40;

  if (score < 50) {
    return { allowed: true, requiresCaptcha: false, score };
  }

  const token = input.captchaToken?.trim();
  if (!token) {
    return {
      allowed: false,
      requiresCaptcha: true,
      score,
      reason: "Se requiere validación CAPTCHA para continuar",
    };
  }

  const verified = await verifyTurnstileToken(token, input.ip);
  if (!verified) {
    return {
      allowed: false,
      requiresCaptcha: true,
      score,
      reason: "No se pudo validar el CAPTCHA",
    };
  }

  return { allowed: true, requiresCaptcha: false, score };
}
