import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Guachi ATC | Turnos y colas digitales",
  description:
    "Cola por QR en recepción, turno con datos de Centinela, actualización en vivo (SSE) y avisos por notificación. Portal admin para generar códigos. Guachi.",
  metadataBase: new URL(
    (() => {
      const url = process.env.NEXT_PUBLIC_APP_URL;
      if (!url && process.env.NODE_ENV === "production") {
        console.warn("[layout] ADVERTENCIA: NEXT_PUBLIC_APP_URL no definida en producción. MetadataBase podría fallar.");
      }
      return url || "http://localhost:3000";
    })(),
  ),
  openGraph: {
    title: "Guachi ATC | Turnos y colas digitales",
    description:
      "Toma tu turno desde el QR, sigue la cola en vivo y recibe avisos en el navegador. Guachi.",
    type: "website",
    locale: "es_VE",
    siteName: "Guachi",
    images: [
      {
        url: "/images/guachi_logo_azul_horizontal.png",
        width: 800,
        height: 200,
        alt: "Guachi",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-linear-to-b from-sa-secondary to-sa-secondary-dark font-sans text-white antialiased">
        {children}
      </body>
    </html>
  );
}
