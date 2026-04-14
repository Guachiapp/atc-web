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
    "Módulo de atención al cliente y gestión de colas para empresas. Parte de Guachi Smart Access.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  openGraph: {
    title: "Guachi ATC | Turnos y colas digitales",
    description:
      "Solicita tu turno escaneando el QR en recepción. Experiencia Guachi Smart Access.",
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
