import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Finanzas Familiares",
  description: "Control familiar de ingresos y gastos.",
  manifest: "/manifest.json",
  themeColor: "#0ea5e9",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png"
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        {/* Manifest + colores barra del sistema */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0ea5e9" />

        {/* iOS PWA */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Finanzas" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />

        {/* Safe area para iPhone con notch */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>

      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white`}
      >
        {/* Splash mínimo (se oculta en cuanto hidrata React) */}
        <div id="__splash" className="fixed inset-0 flex items-center justify-center bg-white z-[9999]">
          <div className="flex flex-col items-center gap-4">
            <img src="/icons/icon-192.png" alt="Finanzas" width={96} height={96} />
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-gray-200">
              <div className="h-full w-1/2 animate-[loading_1.2s_ease-in-out_infinite] bg-[#0ea5e9]" />
            </div>
          </div>

          {/* Animación de carga */}
          <style>{`
            @keyframes loading {
              0% { transform: translateX(-100%) }
              50% { transform: translateX(100%) }
              100% { transform: translateX(100%) }
            }
          `}</style>
        </div>

        {/* Tu app */}
        <div id="__app">{children}</div>

        {/* Ocultar splash cuando React hidrata */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('load', function(){
                const s = document.getElementById('__splash');
                if (s) s.style.display = 'none';
              });
            `,
          }}
        />
      </body>

    </html>
  );
}
