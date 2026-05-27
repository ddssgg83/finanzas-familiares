"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { AppHeader } from "@/components/AppHeader";
import { PageShell } from "@/components/ui/PageShell";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import { useI18n } from "@/lib/i18n/useI18n";

export const dynamic = "force-dynamic";

type GoalFormState = {
  name: string;
  description: string;
  target_amount: string;
  due_date: string;

  // UI solamente (NO existe columna `category` en DB)
  category: string;

  type: string;
  auto_track: boolean;
  track_direction: "ingresos" | "ahorros" | "gastos_reducidos" | "";
  track_category: string;
};

export default function NewFamilyGoalPage() {
  const router = useRouter();
  const { dictionary } = useI18n();
  const t = dictionary.family;
  const newT = t.newGoal;

  // Auth
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // UI
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<GoalFormState>({
    name: "",
    description: "",
    target_amount: "",
    due_date: "",
    category: "",
    type: "",
    auto_track: false,
    track_direction: "",
    track_category: "",
  });

  const { familyCtx, familyLoading, familyError } = useFamilyContext(user);

  // ---------- AUTH ----------
  useEffect(() => {
    let ignore = false;

    async function loadUser() {
      setAuthLoading(true);
      setAuthError(null);

      try {
        const { data } = await supabase.auth.getSession();
        const sessionUser = data.session?.user ?? null;
        if (!ignore) setUser(sessionUser);
      } catch (_err) {
        if (!ignore) {
          setUser(null);
          setAuthError(newT.errors.auth);
        }
      } finally {
        if (!ignore) setAuthLoading(false);
      }
    }

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      ignore = true;
      subscription.unsubscribe();
    };
  }, [newT.errors.auth]);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
    } catch (err) {
      console.error("Error cerrando sesión", err);
    }
  };

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const target = e.target as HTMLInputElement;
    const name = target.name as keyof GoalFormState;

    const value =
      target.type === "checkbox" ? target.checked : target.value;

    setForm((prev) => ({ ...prev, [name]: value as any }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError(newT.errors.needLogin);
      return;
    }

    try {
      setSaving(true);
      setError(null);

      if (familyLoading) {
        setError(newT.errors.familyLoading);
        return;
      }

      if (!familyCtx?.familyId) {
        setError(newT.errors.noFamily);
        return;
      }

      const targetAmountNum = Number(form.target_amount || 0);
      if (!targetAmountNum || targetAmountNum <= 0) {
        setError(newT.errors.target);
        return;
      }

      if (form.auto_track && !form.track_direction) {
        setError(newT.errors.trackDirection);
        return;
      }

      // Si no hay track_category y sí puso category (UI), la usamos como fallback
      const baseCategory = form.category.trim();
      const effectiveTrackCategory = form.auto_track
        ? form.track_category.trim()
        : baseCategory;

      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        target_amount: targetAmountNum,
        due_date: form.due_date || null,

        type: form.type.trim() || null,

        auto_track: form.auto_track,
        track_direction: form.auto_track ? (form.track_direction || null) : null,
        track_category: effectiveTrackCategory ? effectiveTrackCategory : null,

        owner_user_id: user.id,
        family_group_id: familyCtx.familyId,
        family_id: familyCtx.familyId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: insertError } = await supabase
        .from("family_goals")
        .insert(payload)
        .select("id")
        .single();

      if (insertError) throw insertError;

      router.push("/familia/objetivos");
      router.refresh();
    } catch (err: any) {
      console.error("Error creando meta:", err);
      setError(err?.message || newT.errors.create);
    } finally {
      setSaving(false);
    }
  };

  // ---------- UI STATES ----------
  if (authLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-slate-600 dark:text-slate-300">
        {t.loadingSession}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-md space-y-3 rounded-2xl border border-slate-200 bg-white p-5 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-sm font-semibold">{newT.title}</div>
          <p className="text-slate-500 dark:text-slate-400">
            {newT.authBody}
          </p>
          {authError && (
            <p className="text-[11px] text-rose-600 dark:text-rose-400">{authError}</p>
          )}
          <Link
            href="/onboarding?mode=login&next=%2Ffamilia%2Fobjetivos%2Fnuevo"
            className="inline-flex w-fit rounded-full bg-sky-500 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-sky-600"
          >
            {t.login}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col pb-16 md:pb-4">
      <AppHeader
        title={t.title}
        subtitle={newT.subtitle}
        activeTab="familia"
        userName={(user.user_metadata as { full_name?: string } | undefined)?.full_name ?? null}
        userEmail={user.email ?? ""}
        userId={user.id}
        onSignOut={handleSignOut}
      />

      <PageShell maxWidth="3xl">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight md:text-xl">
              {newT.header}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 md:text-sm">
              {newT.body}
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/familia/objetivos")}
            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            {newT.back}
          </button>
        </header>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        {familyLoading && (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200">
            {newT.familyLoading}
          </div>
        )}

        {!familyLoading && !familyCtx?.familyId && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            {newT.noFamily}
            {familyError ? <span className="mt-1 block">{familyError}</span> : null}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-5"
        >
          <div className="space-y-2">
            <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-200">
              {newT.name}
            </label>
            <input
              required
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder={newT.namePlaceholder}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-1 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-200">
              {newT.description}
            </label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
              placeholder={newT.descriptionPlaceholder}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-1 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-200">
                {newT.targetAmount}
              </label>
              <input
                required
                type="number"
                min={0}
                step="100"
                name="target_amount"
                value={form.target_amount}
                onChange={handleChange}
                placeholder={newT.targetPlaceholder}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-1 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-200">
                {newT.dueDate}
              </label>
              <input
                type="date"
                name="due_date"
                value={form.due_date}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-1 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-200">
                {newT.category}
              </label>
              <input
                name="category"
                value={form.category}
                onChange={handleChange}
                placeholder={newT.categoryPlaceholder}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-1 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
              />
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                {newT.categoryHelp}
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-200">
                {newT.type}
              </label>
              <select
                name="type"
                value={form.type}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-1 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
              >
                <option value="">{newT.selectType}</option>
                <option value="ahorro">{newT.typeSavings}</option>
                <option value="deuda">{newT.typeDebt}</option>
                <option value="gasto_controlado">{newT.typeControlledSpend}</option>
                <option value="otro">{newT.typeOther}</option>
              </select>
            </div>
          </div>

          <div className="mt-2 space-y-2 rounded-2xl bg-slate-50 p-3 text-[11px] text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium">{newT.autoTrack}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {newT.autoTrackBody}
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  name="auto_track"
                  checked={form.auto_track}
                  onChange={handleChange}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-400"
                />
                <span className="text-[11px]">{newT.activate}</span>
              </label>
            </div>

            {form.auto_track && (
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-200">
                    {newT.trackDirection}
                  </label>
                  <select
                    name="track_direction"
                    value={form.track_direction}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-1 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
                  >
                    <option value="">{newT.select}</option>
                    <option value="ingresos">{newT.directionIncome}</option>
                    <option value="ahorros">{newT.directionSavings}</option>
                    <option value="gastos_reducidos">{newT.directionReducedSpend}</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-200">
                    {newT.trackCategory}
                  </label>
                  <input
                    name="track_category"
                    value={form.track_category}
                    onChange={handleChange}
                    placeholder={newT.trackCategoryPlaceholder}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-1 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={saving || familyLoading || !familyCtx?.familyId}
              className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? t.saving : familyLoading ? newT.loadingFamily : newT.saveGoal}
            </button>
          </div>
        </form>
      </PageShell>
    </main>
  );
}
