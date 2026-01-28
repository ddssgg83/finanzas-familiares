// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const viewport = {
  themeColor: "#5B5FFF", // tu azul RINDAY
};

export const metadata: Metadata = {
  title: {
    default: "RINDAY",
    template: "%s · RINDAY",
  },
  description:
    "App de finanzas familiares para gestionar ingresos y gastos de forma clara y colaborativa.",
  applicationName: "RINDAY",
  appleWebApp: {
    capable: true,
    title: "RINDAY",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
