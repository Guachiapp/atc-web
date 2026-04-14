import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

export type ValidationResult<T> = { success: true; data: T } | { success: false; error: NextResponse };

export async function validateRequestBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<ValidationResult<z.infer<T>>> {
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

export function sanitizeString(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/<[^>]*>/g, "");
}
