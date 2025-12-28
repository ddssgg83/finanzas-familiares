import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { SupabaseAutoRefreshGuard } from "@/components/SupabaseAutoRefreshGuard";

export const metadata: Metadata = {
  title: "Finanzas Familiares",
  description: "Control de ingresos y gastos",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <SupabaseAutoRefreshGuard />
          <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
