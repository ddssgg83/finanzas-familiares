// src/app/familia/objetivos/[id]/editar/page.tsx
"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { AppHeader } from "@/components/AppHeader";

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

export default function EditFamilyGoalPage(props: any) {
  const router = useRouter();
  const goalId = (props?.params?.id ?? "") as string;

  const [user, setUser] = useState<User | null>(null);
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

  // Cargar usuario + meta existente
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;
        if (!user) {
          if (!cancelled) {
            setError("No se encontró el usuario. Inicia sesión de nuevo.");
          }
          return;
        }

        if (!cancelled) {
          setUser(user);
        }

        if (!goalId) {
          if (!cancelled) {
            setError("No se encontró el ID de la meta.");
          }
          return;
        }

        const { data: goal, error: goalError } = await supabase
          .from("family_goals")
          .select(
            "id,name,description,target_amount,due_date,category,type,status,auto_track,track_direction,track_category"
          )
          .eq("id", goalId)
          .maybeSingle();

        if (goalError) throw goalError;
        if (!goal) {
          if (!cancelled) {
            setError("No se encontró la meta familiar.");
          }
          return;
        }

        if (!cancelled) {
          setForm({
            name: goal.name ?? "",
            description: goal.description ?? "",
            target_amount: goal.target_amount
              ? String(goal.target_amount)
              : "",
            due_date: goal.due_date ? goal.due_date.slice(0, 10) : "",
            category: goal.category ?? "",
            type: goal.type ?? "",
            status: goal.status ?? "",
            auto_track: Boolean(goal.auto_track),
            track_direction: (goal.track_direction ??
              "") as GoalFormState["track_direction"],
            track_category: goal.track_category ?? "",
          });
        }
      } catch (err: any) {
        console.error("Error cargando meta familiar:", err);
        if (!cancelled) {
          setError(
            err?.message || "Ocurrió un error al cargar la meta familiar."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [goalId]);

  const handleChange = (
    e:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLTextAreaElement>
      | React.ChangeEvent<HTMLSelectElement>
  ) => {
    const { name, value, type, checked } = e.target as any;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!goalId) {
      setError("No se encontró el ID de la meta.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const targetAmountNum = Number(form.target_amount || 0);
      if (!targetAmountNum || targetAmountNum <= 0) {
        setError("Ingresa un monto objetivo válido mayor a 0.");
        setSaving(false);
        return;
      }

      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        target_amount: targetAmountNum,
        due_date: form.due_date || null,
        category: form.category || null,
        type: form.type || null,
        status: form.status || null,
        auto_track: form.auto_track,
        track_direction: form.auto_track ? form.track_direction || null : null,
        track_category: form.auto_track ? form.track_category || null : null,
      };

      const { error: updateError } = await supabase
        .from("family_goals")
        .update(payload)
        .eq("id", goalId);

      if (updateError) throw updateError;

      router.push("/familia/objetivos");
    } catch (err: any) {
      console.error("Error actualizando meta familiar:", err);
      setError(
        err?.message || "Ocurrió un error al guardar los cambios de la meta."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    router.push("/familia/objetivos");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <AppHeader
        title="Editar objetivo familiar"
        subtitle="Ajusta el nombre, monto objetivo y configuración de seguimiento de esta meta."
        activeTab="familia"
      />

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-10 pt-4 md:px-6 md:pt-6 lg:px-8">
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
            Cargando información de la meta…
          </div>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h1 className="mb-3 text-base font-semibold">
              Editar objetivo familiar
            </h1>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs md:text-sm">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-700 dark:text-slate-200">
                    Nombre del objetivo
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950"
                    placeholder="Ej. Viaje familiar, fondo de emergencia…"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-700 dark:text-slate-200">
                    Monto objetivo (MXN)
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
                    Fecha límite (opcional)
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
                    Categoría (opcional)
                  </label>
                  <input
                    type="text"
                    name="category"
                    value={form.category}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950"
                    placeholder="Ej. Viajes, ahorro, deudas…"
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-700 dark:text-slate-200">
                    Tipo de objetivo (opcional)
                  </label>
                  <input
                    type="text"
                    name="type"
                    value={form.type}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950"
                    placeholder="Ej. Ahorro, reducción de gasto, pago de deuda…"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-700 dark:text-slate-200">
                    Estatus (opcional)
                  </label>
                  <input
                    type="text"
                    name="status"
                    value={form.status}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950"
                    placeholder="Ej. Activa, en pausa, cumplida…"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-700 dark:text-slate-200">
                  Descripción (opcional)
                </label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950"
                  placeholder="Cuenta un poco más sobre esta meta."
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-950">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    name="auto_track"
                    checked={form.auto_track}
                    onChange={handleChange}
                    className="mt-[2px]"
                  />
                  <span>
                    Activar seguimiento automático con movimientos de gastos /
                    ingresos
                    <span className="mt-1 block text-[10px] text-slate-500 dark:text-slate-400">
                      Si lo activas, podrás elegir hacia dónde se mueve el
                      progreso (ingresos, ahorros, gastos reducidos) y una
                      categoría específica.
                    </span>
                  </span>
                </label>

                {form.auto_track && (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-slate-700 dark:text-slate-200">
                        ¿Qué movimientos cuentan para el avance?
                      </label>
                      <select
                        name="track_direction"
                        value={form.track_direction}
                        onChange={handleChange}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950"
                      >
                        <option value="">Selecciona una opción</option>
                        <option value="ingresos">
                          Ingresos (ej. abonos a la meta)
                        </option>
                        <option value="ahorros">
                          Ahorros (ingresos menos gastos)
                        </option>
                        <option value="gastos_reducidos">
                          Gastos reducidos en cierta categoría
                        </option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-slate-700 dark:text-slate-200">
                        Categoría relacionada (opcional)
                      </label>
                      <input
                        type="text"
                        name="track_category"
                        value={form.track_category}
                        onChange={handleChange}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950"
                        placeholder="Ej. SUPER, VIAJES, SERVICIOS…"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="rounded-full border border-slate-300 px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {saving ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}
