"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { PageShell } from "@/components/ui/PageShell";
import { useI18n } from "@/lib/i18n/useI18n";
import { supabase } from "@/lib/supabase";

type Props = {
  code: string | null;
  redirectTo: string;
};

function prettyAuthError(message: string | undefined, copy: ReturnType<typeof useI18n>["dictionary"]["authCallback"]["errors"]) {
  const msg = (message ?? "").toLowerCase();

  if (msg.includes("expired") || msg.includes("invalid")) {
    return copy.expired;
  }

  if (msg.includes("code verifier")) {
    return copy.sameDevice;
  }

  return copy.generic;
}

export function AuthCallbackClient({ code, redirectTo }: Props) {
  const router = useRouter();
  const { dictionary } = useI18n();
  const t = dictionary.authCallback;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timeoutId: number | null = null;
    let unsubscribe: (() => void) | null = null;

    const completeLogin = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      if (data.session && alive) {
        router.replace(redirectTo);
        return true;
      }

      return false;
    };

    const run = async () => {
      try {
        setError(null);

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        if (await completeLogin()) return;

        const { data: subscription } = supabase.auth.onAuthStateChange(
          async (_event, session) => {
            if (!alive || !session) return;
            router.replace(redirectTo);
          }
        );

        unsubscribe = () => {
          subscription.subscription.unsubscribe();
        };

        timeoutId = window.setTimeout(async () => {
          if (!alive) return;
          const hasSession = await completeLogin().catch(() => false);
          if (!hasSession) {
            setError(t.errors.noSession);
          }
        }, 2500);
      } catch (err: any) {
        if (!alive) return;
        setError(prettyAuthError(err?.message, t.errors));
      }
    };

    void run();

    return () => {
      alive = false;
      if (timeoutId) window.clearTimeout(timeoutId);
      unsubscribe?.();
    };
  }, [code, redirectTo, router, t.errors]);

  return (
    <main className="flex min-h-screen flex-col pb-16 md:pb-4">
      <AppHeader
        title={t.title}
        subtitle={t.subtitle}
        activeTab="dashboard"
      />

      <PageShell maxWidth="2xl">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
            {error ? t.errorTitle : t.successTitle}
          </h1>

          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {error
              ? error
              : t.successBody}
          </p>

          {error ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={`/onboarding?mode=login&next=${encodeURIComponent(redirectTo)}`}
                className="inline-flex items-center rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-600"
              >
                {t.requestNewLink}
              </a>
              <a
                href={redirectTo}
                className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                {t.goApp}
              </a>
            </div>
          ) : (
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-sky-500" />
            </div>
          )}
        </section>
      </PageShell>
    </main>
  );
}
