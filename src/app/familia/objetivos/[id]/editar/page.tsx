"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { AppHeader } from "@/components/AppHeader";
import { PageShell } from "@/components/ui/PageShell";
import { useI18n } from "@/lib/i18n/useI18n";

export const dynamic = "force-dynamic";

type GoalFormState = {
  name: string;
  description: string;
  target_amount: string;
  due_date: string;
  category: string;
  type: string;
  status: string;
  auto_track: boolean;
  track_direction: "ingresos" | "ahorros" | "gastos_reducidos" | "";
  track_category: string;
};

export default function EditFamilyGoalPage() {
  const router = useRouter();
  const { dictionary } = useI18n();
  const t = dictionary.family;
  const newT = t.newGoal;
  const editT = t.editGoal;

  // ✅ App Router (client): params via useParams()
  const params = useParams<{ id: string }>();
  const goalId = useMemo(() => {
    const raw = params?.id;
    return Array.isArray(raw) ? raw[0] : raw ?? "";
  }, [params]);

  // Auth
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Data
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<GoalFormState>({
    name: "",
    description: "",
    target_amount: "",
    due_date: "",
    category: "",
    type: "",
    status: "",
    auto_track: false,
    track_direction: "",
    track_category: "",
  });

  // ---------- AUTH + LOAD ----------
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
          setAuthError(editT.errors.auth);
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
  }, [editT.errors.auth]);

  // Cargar meta cuando haya user + goalId
  useEffect(() => {
    let cancelled = false;

    const loadGoal = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      if (!goalId) {
        setError(editT.errors.missingId);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const { data: goal, error: goalError } = await supabase
          .from("family_goals")
          .select(
            "id,name,description,target_amount,due_date,category,type,status,auto_track,track_direction,track_category"
          )
          .eq("id", goalId)
          .maybeSingle();

        if (goalError) throw goalError;

        if (!goal) {
          if (!cancelled) setError(editT.errors.missingGoal);
          return;
        }

        if (!cancelled) {
          setForm({
            name: goal.name ?? "",
            description: goal.description ?? "",
            target_amount: goal.target_amount ? String(goal.target_amount) : "",
            due_date: goal.due_date ? String(goal.due_date).slice(0, 10) : "",
            category: goal.category ?? "",
            type: goal.type ?? "",
            status: goal.status ?? "",
            auto_track: Boolean(goal.auto_track),
            track_direction: (goal.track_direction ?? "") as GoalFormState["track_direction"],
            track_category: goal.track_category ?? "",
          });
        }
      } catch (err: any) {
        console.error("Error cargando meta familiar:", err);
        if (!cancelled) {
          setError(err?.message || editT.errors.load);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadGoal();

    return () => {
      cancelled = true;
    };
  }, [user, goalId, editT.errors.load, editT.errors.missingGoal, editT.errors.missingId]);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
    } catch (err) {
      console.error("Error cerrando sesión", err);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!goalId) {
      setError(editT.errors.missingId);
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const targetAmountNum = Number(form.target_amount || 0);
      if (!targetAmountNum || targetAmountNum <= 0) {
        setError(editT.errors.target);
        return;
      }

      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        target_amount: targetAmountNum,
        due_date: form.due_date || null,
        category: form.category.trim() || null,
        type: form.type.trim() || null,
        status: form.status.trim() || null,
        auto_track: form.auto_track,
        track_direction: form.auto_track ? (form.track_direction || null) : null,
        track_category: form.auto_track ? (form.track_category.trim() || null) : null,
        updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from("family_goals")
        .update(payload)
        .eq("id", goalId);

      if (updateError) throw updateError;

      router.push("/familia/objetivos");
      router.refresh();
    } catch (err: any) {
      console.error("Error actualizando meta familiar:", err);
      setError(err?.message || editT.errors.save);
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
          <div className="text-sm font-semibold">{editT.guestTitle}</div>
          <p className="text-slate-500 dark:text-slate-400">
            {editT.guestBody}
          </p>
          {authError && <p className="text-[11px] text-rose-600 dark:text-rose-400">{authError}</p>}
          <Link
            href="/"
            className="inline-flex w-fit rounded-full bg-sky-500 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-sky-600"
          >
            {editT.goHome}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col pb-16 md:pb-4">
      <AppHeader
        title={editT.title}
        subtitle={editT.subtitle}
        activeTab="familia"
        userName={(user.user_metadata as { full_name?: string } | undefined)?.full_name ?? null}
        userEmail={user.email ?? ""}
        userId={user.id}
        onSignOut={handleSignOut}
      />

      <PageShell maxWidth="3xl">
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {editT.loading}
          </div>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h1 className="text-base font-semibold">{editT.header}</h1>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  {editT.body}
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push("/familia/objetivos")}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                {newT.back}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs md:text-sm">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-700 dark:text-slate-200">
                    {editT.goalName}
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950"
                    placeholder={editT.goalNamePlaceholder}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-700 dark:text-slate-200">
                    {editT.targetAmount}
                  </label>
                  <input
                    type="number"
                    name="target_amount"
                    value={form.target_amount}
                    onChange={handleChange}
                    min={0}
                    step="100"
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950"
                    placeholder="Ej. 50000"
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-700 dark:text-slate-200">
                    {editT.dueDate}
                  </label>
                  <input
                    type="date"
                    name="due_date"
                    value={form.due_date}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-700 dark:text-slate-200">
                    {newT.category}
                  </label>
                  <input
                    type="text"
                    name="category"
                    value={form.category}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950"
                    placeholder={editT.categoryPlaceholder}
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-700 dark:text-slate-200">
                    {newT.type}
                  </label>
                  <input
                    type="text"
                    name="type"
                    value={form.type}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950"
                    placeholder={editT.typePlaceholder}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-700 dark:text-slate-200">
                    {editT.status}
                  </label>
                  <input
                    type="text"
                    name="status"
                    value={form.status}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950"
                    placeholder={editT.statusPlaceholder}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-700 dark:text-slate-200">
                  {newT.description}
                </label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950"
                  placeholder={editT.descriptionPlaceholder}
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-950">
                <label className="flex items-start gap-2">
                  <input type="checkbox" name="auto_track" checked={form.auto_track} onChange={handleChange} className="mt-[2px]" />
                  <span>
                    {editT.autoTrack}
                    <span className="mt-1 block text-[10px] text-slate-500 dark:text-slate-400">
                      {editT.autoTrackBody}
                    </span>
                  </span>
                </label>

                {form.auto_track && (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-slate-700 dark:text-slate-200">
                        {editT.whatCounts}
                      </label>
                      <select
                        name="track_direction"
                        value={form.track_direction}
                        onChange={handleChange}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950"
                      >
                        <option value="">{editT.selectOption}</option>
                        <option value="ingresos">{editT.income}</option>
                        <option value="ahorros">{editT.savings}</option>
                        <option value="gastos_reducidos">{editT.reducedSpend}</option>
                      </select>
                      <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                        {editT.savingsNote}
                      </p>
                    </div>

                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-slate-700 dark:text-slate-200">
                        {editT.relatedCategory}
                      </label>
                      <input
                        type="text"
                        name="track_category"
                        value={form.track_category}
                        onChange={handleChange}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950"
                        placeholder={editT.relatedCategoryPlaceholder}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => router.push("/familia/objetivos")}
                  className="rounded-full border border-slate-300 px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {saving ? t.saving : editT.saveChanges}
                </button>
              </div>
            </form>
          </section>
        )}
      </PageShell>
    </main>
  );
}
