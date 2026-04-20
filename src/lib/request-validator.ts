import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

export type ValidationResult<T> = { success: true; data: T } | { success: false; error: NextResponse };

export async function validateRequestBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<ValidationResult<z.infer<T>>> {
  // M6: Validación de Content-Type
  const contentType = request.headers.get("content-type");
  if (!contentType || !contentType.toLowerCase().includes("application/json")) {
    return {
      success: false,
      error: NextResponse.json(
        { success: false, error: "Se requiere Content-Type: application/json" },
        { status: 415 },
      ),
    };
  }

  try {
    const body = await request.json();
    return { success: true, data: schema.parse(body) };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        error: NextResponse.json(
          { success: false, error: "Datos inválidos", details: error.issues },
          { status: 400 },
        ),
      };
    }
    return {
      success: false,
      error: NextResponse.json({ success: false, error: "JSON inválido" }, { status: 400 }),
    };
  }
}

/**
 * Limpia strings de entrada eliminando HTML, caracteres de control y espacios extra.
 * M7: Si el valor parece ser PII (números, identificadores), se puede ser más estricto.
 */
export function sanitizeString(value: string, options?: { strictPii?: boolean }): string {
  let v = value.trim().replace(/\s+/g, " ");
  
  if (options?.strictPii) {
    // Para cedula/telefono: solo números, letras básicas y guiones.
    return v.replace(/[^a-zA-Z0-9-]/g, "");
  }

  return v
    .replace(/[\x00-\x1F\x7F]/g, "") // Control chars
    .replace(/<[^>]*>/g, ""); // Basic HTML tags
}
