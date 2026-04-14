import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Si en el servidor hay otro `package-lock.json` en un directorio padre (p. ej. `/codes/next/`), Next
// infiere mal la raíz del workspace. Fijamos la raíz de tracing a esta app (atc-web).
const configDir =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactCompiler: true,
  outputFileTracingRoot: configDir,
};

export default nextConfig;
