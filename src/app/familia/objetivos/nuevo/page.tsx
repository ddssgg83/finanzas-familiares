"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { AppHeader } from "@/components/AppHeader";

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
  const [user, setUser] = useState<User | null>(null);
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

 useEffect(() => {
  let cancelled = false;

  const getUser = async () => {
    try {
      // ✅ OFFLINE-SAFE
      const { data } = await supabase.auth.getSession();
      const sessionUser = data.session?.user ?? null;

      if (!sessionUser) {
        if (!cancelled) setError("No se encontró el usuario. Inicia sesión de nuevo.");
        return;
      }

      if (!cancelled) setUser(sessionUser);
    } catch (err) {
      if (!cancelled) setError("No se pudo obtener el usuario.");
    }
  };

  getUser();

  return () => {
    cancelled = true;
  };
}, []);


  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const target = e.target as HTMLInputElement;
    const name = target.name as keyof GoalFormState;

    const value =
      target.type === "checkbox"
        ? (target as HTMLInputElement).checked
        : target.value;

    setForm((prev) => ({ ...prev, [name]: value as any }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!user) return;

  try {
    setSaving(true);
    setError(null);

    let familyGroupId: string | null = null;

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("family_group_id")
        .eq("id", user.id)
        .maybeSingle();
      if (profile) familyGroupId = profile.family_group_id ?? null;
    } catch {
      // modo individual
    }

    const baseCategory = form.category.trim();
    const effectiveTrackCategory = form.auto_track
      ? form.track_category.trim()
      : baseCategory;

    const payload = {
      name: form.name.trim(),
      target_amount: Number(form.target_amount || 0),
      due_date: form.due_date || null,

      type: form.type.trim() || null,

      auto_track: form.auto_track,
      track_direction: form.auto_track ? form.track_direction || null : null,
      track_category: effectiveTrackCategory ? effectiveTrackCategory : null,

      owner_user_id: user.id,
      family_group_id: familyGroupId,
    };

    const { error: insertError } = await supabase
      .from("family_goals")
      .insert(payload);

    if (insertError) throw insertError;

    router.push("/familia/objetivos");
  } catch (err: any) {
    console.error("Error creando meta:", err);
    setError(
      err?.message || "Ocurrió un error al crear la meta. Intenta de nuevo."
    );
  } finally {
    setSaving(false);
  }
};

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <AppHeader
        title="Familia"
        subtitle="Nueva meta familiar"
        activeTab="familia"
      />

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pb-10 pt-4 md:px-6 md:pt-6 lg:px-8">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight md:text-xl">
              Crear objetivo familiar
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 md:text-sm">
              Define una meta clara y opcionalmente vincúlala a una categoría
              para que avance automáticamente.
            </p>
          </div>
        </header>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-5"
        >
          <div className="space-y-2">
            <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-200">
              Nombre de la meta
            </label>
            <input
              required
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Ej. Fondo de emergencia, Viaje a Europa, Enganche casa"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-1 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-200">
              Descripción (opcional)
            </label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
              placeholder="Cuenta a tu familia de qué trata esta meta."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-1 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-200">
                Monto objetivo
              </label>
              <input
                required
                type="number"
                min={0}
                step="100"
                name="target_amount"
                value={form.target_amount}
                onChange={handleChange}
                placeholder="Ej. 50000"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-1 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-200">
                Fecha objetivo (opcional)
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
                Categoría (opcional)
              </label>
              <input
                name="category"
                value={form.category}
                onChange={handleChange}
                placeholder="Ej. Vacaciones, Casa, Educación"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-1 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-200">
                Tipo (opcional)
              </label>
              <select
                name="type"
                value={form.type}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-1 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
              >
                <option value="">Selecciona un tipo</option>
                <option value="ahorro">Ahorro</option>
                <option value="deuda">Pago de deuda</option>
                <option value="gasto_controlado">Gasto controlado</option>
                <option value="otro">Otro</option>
              </select>
            </div>
          </div>

          <div className="mt-2 space-y-2 rounded-2xl bg-slate-50 p-3 text-[11px] text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium">Actualizar esta meta automáticamente</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Si activas esta opción, la meta se actualizará cada que registres
                  un movimiento con cierta categoría.
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
                <span className="text-[11px]">Activar</span>
              </label>
            </div>

            {form.auto_track && (
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-200">
                    Dirección del avance
                  </label>
                  <select
                    name="track_direction"
                    value={form.track_direction}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-1 focus:ring-emerald-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
                  >
                    <option value="">Selecciona</option>
                    <option value="ingresos">Ingresos (aportes)</option>
                    <option value="ahorros">Ahorros</option>
                    <option value="gastos_reducidos">Gastos reducidos</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-200">
                    Categoría que actualiza esta meta
                  </label>
                  <input
                    name="track_category"
                    value={form.track_category}
                    onChange={handleChange}
                    placeholder="Debe coincidir con la categoría de tus movimientos"
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
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Guardando…" : "Guardar meta"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
