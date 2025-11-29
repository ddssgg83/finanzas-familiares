"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type PatrimonioSectionProps = {
  userId: string;
};

type Asset = {
  id: string;
  name: string;
  category: string;
  current_value: number;
  owner: string | null;
  notes: string | null;
};

type Debt = {
  id: string;
  name: string;
  category: string;
  total_amount: number;
  monthly_payment: number | null;
  interest_rate: number | null;
  due_date: string | null;
  owner: string | null;
  notes: string | null;
};

type Goal = {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  owner: string | null;
  notes: string | null;
};

type Investment = {
  id: string;
  name: string;
  platform: string | null;
  category: string;
  invested_amount: number;
  current_value: number;
  owner: string | null;
  notes: string | null;
};

type TabKey = "assets" | "debts" | "goals" | "investments";

function formatMoney(num: number) {
  return num.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  });
}

export function PatrimonioSection({ userId }: PatrimonioSectionProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("assets");

  const [assets, setAssets] = useState<Asset[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Formularios simples
  const [assetForm, setAssetForm] = useState({
    name: "",
    category: "",
    current_value: "",
    owner: "",
  });

  const [debtForm, setDebtForm] = useState({
    name: "",
    category: "",
    total_amount: "",
    monthly_payment: "",
    interest_rate: "",
    due_date: "",
    owner: "",
  });

  const [goalForm, setGoalForm] = useState({
    name: "",
    target_amount: "",
    current_amount: "",
    deadline: "",
    owner: "",
  });

  const [investmentForm, setInvestmentForm] = useState({
    name: "",
    platform: "",
    category: "",
    invested_amount: "",
    current_value: "",
    owner: "",
  });

  // Cargar datos al entrar / cambiar de usuario
  useEffect(() => {
    if (!userId) return;

    async function loadAll() {
      setLoading(true);
      setError(null);
      try {
        const [assetsRes, debtsRes, goalsRes, investmentsRes] =
          await Promise.all([
            supabase
              .from("assets")
              .select("*")
              .eq("user_id", userId)
              .order("created_at", { ascending: true }),
            supabase
              .from("debts")
              .select("*")
              .eq("user_id", userId)
              .order("created_at", { ascending: true }),
            supabase
              .from("goals")
              .select("*")
              .eq("user_id", userId)
              .order("created_at", { ascending: true }),
            supabase
              .from("investments")
              .select("*")
              .eq("user_id", userId)
              .order("created_at", { ascending: true }),
          ]);

        if (assetsRes.error) throw assetsRes.error;
        if (debtsRes.error) throw debtsRes.error;
        if (goalsRes.error) throw goalsRes.error;
        if (investmentsRes.error) throw investmentsRes.error;

        setAssets(
          (assetsRes.data ?? []).map((a: any) => ({
            id: a.id,
            name: a.name,
            category: a.category,
            current_value: Number(a.current_value ?? 0),
            owner: a.owner,
            notes: a.notes,
          }))
        );

        setDebts(
          (debtsRes.data ?? []).map((d: any) => ({
            id: d.id,
            name: d.name,
            category: d.category,
            total_amount: Number(d.total_amount ?? 0),
            monthly_payment: d.monthly_payment
              ? Number(d.monthly_payment)
              : null,
            interest_rate: d.interest_rate ? Number(d.interest_rate) : null,
            due_date: d.due_date,
            owner: d.owner,
            notes: d.notes,
          }))
        );

        setGoals(
          (goalsRes.data ?? []).map((g: any) => ({
            id: g.id,
            name: g.name,
            target_amount: Number(g.target_amount ?? 0),
            current_amount: Number(g.current_amount ?? 0),
            deadline: g.deadline,
            owner: g.owner,
            notes: g.notes,
          }))
        );

        setInvestments(
          (investmentsRes.data ?? []).map((i: any) => ({
            id: i.id,
            name: i.name,
            platform: i.platform,
            category: i.category,
            invested_amount: Number(i.invested_amount ?? 0),
            current_value: Number(i.current_value ?? 0),
            owner: i.owner,
            notes: i.notes,
          }))
        );
      } catch (err: any) {
        console.error(err);
        setError("No se pudo cargar el patrimonio.");
      } finally {
        setLoading(false);
      }
    }

    loadAll();
  }, [userId]);

  // Totales
  const totalAssets = useMemo(
    () => assets.reduce((sum, a) => sum + a.current_value, 0),
    [assets]
  );

  const totalDebts = useMemo(
    () => debts.reduce((sum, d) => sum + d.total_amount, 0),
    [debts]
  );

  const netWorth = totalAssets - totalDebts;

  const totalInvestmentsValue = useMemo(
    () => investments.reduce((sum, i) => sum + i.current_value, 0),
    [investments]
  );

  const goalsProgress = useMemo(() => {
    if (!goals.length) return 0;
    const sumTarget = goals.reduce((s, g) => s + g.target_amount, 0);
    const sumCurrent = goals.reduce((s, g) => s + g.current_amount, 0);
    if (!sumTarget) return 0;
    return (sumCurrent * 100) / sumTarget;
  }, [goals]);

  // Helpers para guardar
  async function handleSaveAsset(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const value = Number(assetForm.current_value);
      if (!assetForm.name || !value) {
        alert("Nombre y valor son obligatorios.");
        return;
      }
      const { data, error } = await supabase
        .from("assets")
        .insert({
          user_id: userId,
          name: assetForm.name,
          category: assetForm.category || "OTRO",
          current_value: value,
          owner: assetForm.owner || null,
        })
        .select("*")
        .single();

      if (error) throw error;

      setAssets((prev) => [
        ...prev,
        {
          id: data.id,
          name: data.name,
          category: data.category,
          current_value: Number(data.current_value ?? 0),
          owner: data.owner,
          notes: data.notes,
        },
      ]);
      setAssetForm({ name: "", category: "", current_value: "", owner: "" });
    } catch (err: any) {
      console.error(err);
      setError("No se pudo guardar el activo.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDebt(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const total = Number(debtForm.total_amount);
      if (!debtForm.name || !total) {
        alert("Nombre y saldo total son obligatorios.");
        return;
      }
      const { data, error } = await supabase
        .from("debts")
        .insert({
          user_id: userId,
          name: debtForm.name,
          category: debtForm.category || "OTRA",
          total_amount: total,
          monthly_payment: debtForm.monthly_payment
            ? Number(debtForm.monthly_payment)
            : null,
          interest_rate: debtForm.interest_rate
            ? Number(debtForm.interest_rate)
            : null,
          due_date: debtForm.due_date || null,
          owner: debtForm.owner || null,
        })
        .select("*")
        .single();

      if (error) throw error;

      setDebts((prev) => [
        ...prev,
        {
          id: data.id,
          name: data.name,
          category: data.category,
          total_amount: Number(data.total_amount ?? 0),
          monthly_payment: data.monthly_payment
            ? Number(data.monthly_payment)
            : null,
          interest_rate: data.interest_rate
            ? Number(data.interest_rate)
            : null,
          due_date: data.due_date,
          owner: data.owner,
          notes: data.notes,
        },
      ]);
      setDebtForm({
        name: "",
        category: "",
        total_amount: "",
        monthly_payment: "",
        interest_rate: "",
        due_date: "",
        owner: "",
      });
    } catch (err: any) {
      console.error(err);
      setError("No se pudo guardar la deuda.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveGoal(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const target = Number(goalForm.target_amount);
      const current = Number(goalForm.current_amount || 0);
      if (!goalForm.name || !target) {
        alert("Nombre y monto objetivo son obligatorios.");
        return;
      }
      const { data, error } = await supabase
        .from("goals")
        .insert({
          user_id: userId,
          name: goalForm.name,
          target_amount: target,
          current_amount: current,
          deadline: goalForm.deadline || null,
          owner: goalForm.owner || null,
        })
        .select("*")
        .single();

      if (error) throw error;

      setGoals((prev) => [
        ...prev,
        {
          id: data.id,
          name: data.name,
          target_amount: Number(data.target_amount ?? 0),
          current_amount: Number(data.current_amount ?? 0),
          deadline: data.deadline,
          owner: data.owner,
          notes: data.notes,
        },
      ]);
      setGoalForm({
        name: "",
        target_amount: "",
        current_amount: "",
        deadline: "",
        owner: "",
      });
    } catch (err: any) {
      console.error(err);
      setError("No se pudo guardar la meta.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveInvestment(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const invested = Number(investmentForm.invested_amount);
      const current = Number(investmentForm.current_value || invested);
      if (!investmentForm.name || !invested) {
        alert("Nombre y monto invertido son obligatorios.");
        return;
      }
      const { data, error } = await supabase
        .from("investments")
        .insert({
          user_id: userId,
          name: investmentForm.name,
          platform: investmentForm.platform || null,
          category: investmentForm.category || "OTRA",
          invested_amount: invested,
          current_value: current,
          owner: investmentForm.owner || null,
        })
        .select("*")
        .single();

      if (error) throw error;

      setInvestments((prev) => [
        ...prev,
        {
          id: data.id,
          name: data.name,
          platform: data.platform,
          category: data.category,
          invested_amount: Number(data.invested_amount ?? 0),
          current_value: Number(data.current_value ?? 0),
          owner: data.owner,
          notes: data.notes,
        },
      ]);
      setInvestmentForm({
        name: "",
        platform: "",
        category: "",
        invested_amount: "",
        current_value: "",
        owner: "",
      });
    } catch (err: any) {
      console.error(err);
      setError("No se pudo guardar la inversión.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Patrimonio familiar</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Activos, deudas, metas e inversiones de toda la familia.
          </p>
        </div>
        <div className="text-right text-xs">
          <div className="font-medium">
            Valor neto:{" "}
            <span
              className={
                netWorth >= 0 ? "text-emerald-600" : "text-rose-600"
              }
            >
              {formatMoney(netWorth)}
            </span>
          </div>
          <div className="text-[11px] text-slate-500">
            Activos: {formatMoney(totalAssets)} · Deudas:{" "}
            {formatMoney(totalDebts)}
          </div>
        </div>
      </div>

      {/* Tarjetas de resumen */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-900/50">
          <div className="text-slate-500 dark:text-slate-300">Activos</div>
          <div className="mt-1 text-lg font-semibold text-emerald-600 dark:text-emerald-400">
            {formatMoney(totalAssets)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {assets.length} registro(s)
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-900/50">
          <div className="text-slate-500 dark:text-slate-300">Deudas</div>
          <div className="mt-1 text-lg font-semibold text-rose-600 dark:text-rose-400">
            {formatMoney(totalDebts)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {debts.length} registro(s)
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-900/50">
          <div className="text-slate-500 dark:text-slate-300">
            Progreso de metas
          </div>
          <div className="mt-1 text-lg font-semibold text-sky-600 dark:text-sky-400">
            {goals.length ? `${goalsProgress.toFixed(1)}%` : "--"}
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded bg-slate-200 dark:bg-slate-700">
            <div
              className="h-2 rounded bg-sky-500"
              style={{ width: `${Math.min(Math.max(goalsProgress, 5), 100)}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-900/50">
          <div className="text-slate-500 dark:text-slate-300">
            Inversiones
          </div>
          <div className="mt-1 text-lg font-semibold text-emerald-600 dark:text-emerald-400">
            {formatMoney(totalInvestmentsValue)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {investments.length} registro(s)
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-4 border-b border-slate-200 text-xs dark:border-slate-700">
        <div className="flex flex-wrap gap-2">
          {[
            { key: "assets", label: "Activos" },
            { key: "debts", label: "Deudas" },
            { key: "goals", label: "Metas" },
            { key: "investments", label: "Inversiones" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as TabKey)}
              className={`rounded-t-lg px-3 py-1 ${
                activeTab === tab.key
                  ? "bg-white text-sky-600 shadow-sm dark:bg-slate-900"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="mt-2 text-xs text-rose-500">
          {error} Intenta recargar la página.
        </p>
      )}

      {loading && (
        <p className="mt-2 text-xs text-slate-500">
          Cargando información de patrimonio...
        </p>
      )}

      {/* Contenido por tab */}
      <div className="mt-3 space-y-4 text-xs">
        {/* Activos */}
        {activeTab === "assets" && (
          <>
            <form
              onSubmit={handleSaveAsset}
              className="grid gap-2 md:grid-cols-[2fr,1fr,1fr,1fr,auto]"
            >
              <input
                type="text"
                placeholder="Nombre del activo (casa, coche, etc.)"
                value={assetForm.name}
                onChange={(e) =>
                  setAssetForm((f) => ({ ...f, name: e.target.value }))
                }
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              />
              <input
                type="text"
                placeholder="Categoría"
                value={assetForm.category}
                onChange={(e) =>
                  setAssetForm((f) => ({ ...f, category: e.target.value }))
                }
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              />
              <input
                type="number"
                placeholder="Valor actual"
                value={assetForm.current_value}
                onChange={(e) =>
                  setAssetForm((f) => ({
                    ...f,
                    current_value: e.target.value,
                  }))
                }
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              />
              <input
                type="text"
                placeholder="Propietario (opcional)"
                value={assetForm.owner}
                onChange={(e) =>
                  setAssetForm((f) => ({ ...f, owner: e.target.value }))
                }
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              />
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-sky-500 px-3 py-1 text-xs font-medium text-white hover:bg-sky-600 disabled:opacity-60"
              >
                {saving ? "Guardando..." : "Agregar"}
              </button>
            </form>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-700">
                    <th className="px-2 py-1">Nombre</th>
                    <th className="px-2 py-1">Categoría</th>
                    <th className="px-2 py-1 text-right">Valor actual</th>
                    <th className="px-2 py-1">Propietario</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a) => (
                    <tr
                      key={a.id}
                      className="border-b border-slate-100 dark:border-slate-800"
                    >
                      <td className="px-2 py-1">{a.name}</td>
                      <td className="px-2 py-1">{a.category}</td>
                      <td className="px-2 py-1 text-right">
                        {formatMoney(a.current_value)}
                      </td>
                      <td className="px-2 py-1">{a.owner}</td>
                    </tr>
                  ))}
                  {!assets.length && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-2 py-2 text-center text-slate-400"
                      >
                        Aún no registras activos.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Deudas */}
        {activeTab === "debts" && (
          <>
            <form
              onSubmit={handleSaveDebt}
              className="grid gap-2 md:grid-cols-[2fr,1fr,1fr,1fr,1fr,auto]"
            >
              <input
                type="text"
                placeholder="Nombre de la deuda (hipoteca, tarjeta...)"
                value={debtForm.name}
                onChange={(e) =>
                  setDebtForm((f) => ({ ...f, name: e.target.value }))
                }
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              />
              <input
                type="text"
                placeholder="Categoría"
                value={debtForm.category}
                onChange={(e) =>
                  setDebtForm((f) => ({ ...f, category: e.target.value }))
                }
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              />
              <input
                type="number"
                placeholder="Saldo total"
                value={debtForm.total_amount}
                onChange={(e) =>
                  setDebtForm((f) => ({
                    ...f,
                    total_amount: e.target.value,
                  }))
                }
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              />
              <input
                type="number"
                placeholder="Pago mensual"
                value={debtForm.monthly_payment}
                onChange={(e) =>
                  setDebtForm((f) => ({
                    ...f,
                    monthly_payment: e.target.value,
                  }))
                }
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              />
              <input
                type="number"
                placeholder="% interés anual"
                value={debtForm.interest_rate}
                onChange={(e) =>
                  setDebtForm((f) => ({
                    ...f,
                    interest_rate: e.target.value,
                  }))
                }
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              />
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-sky-500 px-3 py-1 text-xs font-medium text-white hover:bg-sky-600 disabled:opacity-60"
              >
                {saving ? "Guardando..." : "Agregar"}
              </button>
            </form>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-700">
                    <th className="px-2 py-1">Nombre</th>
                    <th className="px-2 py-1">Categoría</th>
                    <th className="px-2 py-1 text-right">Saldo total</th>
                    <th className="px-2 py-1 text-right">Pago mensual</th>
                    <th className="px-2 py-1 text-right">% interés</th>
                  </tr>
                </thead>
                <tbody>
                  {debts.map((d) => (
                    <tr
                      key={d.id}
                      className="border-b border-slate-100 dark:border-slate-800"
                    >
                      <td className="px-2 py-1">{d.name}</td>
                      <td className="px-2 py-1">{d.category}</td>
                      <td className="px-2 py-1 text-right">
                        {formatMoney(d.total_amount)}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {d.monthly_payment != null
                          ? formatMoney(d.monthly_payment)
                          : "-"}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {d.interest_rate != null
                          ? `${d.interest_rate.toFixed(2)}%`
                          : "-"}
                      </td>
                    </tr>
                  ))}
                  {!debts.length && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-2 py-2 text-center text-slate-400"
                      >
                        Aún no registras deudas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Metas */}
        {activeTab === "goals" && (
          <>
            <form
              onSubmit={handleSaveGoal}
              className="grid gap-2 md:grid-cols-[2fr,1fr,1fr,1fr,auto]"
            >
              <input
                type="text"
                placeholder="Meta (fondo de emergencia, viaje...)"
                value={goalForm.name}
                onChange={(e) =>
                  setGoalForm((f) => ({ ...f, name: e.target.value }))
                }
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              />
              <input
                type="number"
                placeholder="Objetivo"
                value={goalForm.target_amount}
                onChange={(e) =>
                  setGoalForm((f) => ({
                    ...f,
                    target_amount: e.target.value,
                  }))
                }
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              />
              <input
                type="number"
                placeholder="Acumulado"
                value={goalForm.current_amount}
                onChange={(e) =>
                  setGoalForm((f) => ({
                    ...f,
                    current_amount: e.target.value,
                  }))
                }
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              />
              <input
                type="date"
                value={goalForm.deadline}
                onChange={(e) =>
                  setGoalForm((f) => ({ ...f, deadline: e.target.value }))
                }
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              />
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-sky-500 px-3 py-1 text-xs font-medium text-white hover:bg-sky-600 disabled:opacity-60"
              >
                {saving ? "Guardando..." : "Agregar"}
              </button>
            </form>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-700">
                    <th className="px-2 py-1">Meta</th>
                    <th className="px-2 py-1 text-right">Objetivo</th>
                    <th className="px-2 py-1 text-right">Acumulado</th>
                    <th className="px-2 py-1 text-right">Progreso</th>
                    <th className="px-2 py-1">Fecha objetivo</th>
                  </tr>
                </thead>
                <tbody>
                  {goals.map((g) => {
                    const p = g.target_amount
                      ? (g.current_amount * 100) / g.target_amount
                      : 0;
                    return (
                      <tr
                        key={g.id}
                        className="border-b border-slate-100 dark:border-slate-800"
                      >
                        <td className="px-2 py-1">{g.name}</td>
                        <td className="px-2 py-1 text-right">
                          {formatMoney(g.target_amount)}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {formatMoney(g.current_amount)}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {p.toFixed(1)}%
                        </td>
                        <td className="px-2 py-1">
                          {g.deadline ?? "-"}
                        </td>
                      </tr>
                    );
                  })}
                  {!goals.length && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-2 py-2 text-center text-slate-400"
                      >
                        Aún no registras metas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Inversiones */}
        {activeTab === "investments" && (
          <>
            <form
              onSubmit={handleSaveInvestment}
              className="grid gap-2 md:grid-cols-[2fr,1fr,1fr,1fr,1fr,auto]"
            >
              <input
                type="text"
                placeholder="Nombre de la inversión (CETE, ETF...)"
                value={investmentForm.name}
                onChange={(e) =>
                  setInvestmentForm((f) => ({ ...f, name: e.target.value }))
                }
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              />
              <input
                type="text"
                placeholder="Plataforma (GBM, Fintual...)"
                value={investmentForm.platform}
                onChange={(e) =>
                  setInvestmentForm((f) => ({
                    ...f,
                    platform: e.target.value,
                  }))
                }
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              />
              <input
                type="number"
                placeholder="Invertido"
                value={investmentForm.invested_amount}
                onChange={(e) =>
                  setInvestmentForm((f) => ({
                    ...f,
                    invested_amount: e.target.value,
                  }))
                }
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              />
              <input
                type="number"
                placeholder="Valor actual"
                value={investmentForm.current_value}
                onChange={(e) =>
                  setInvestmentForm((f) => ({
                    ...f,
                    current_value: e.target.value,
                  }))
                }
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              />
              <input
                type="text"
                placeholder="Categoría"
                value={investmentForm.category}
                onChange={(e) =>
                  setInvestmentForm((f) => ({
                    ...f,
                    category: e.target.value,
                  }))
                }
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              />
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-sky-500 px-3 py-1 text-xs font-medium text-white hover:bg-sky-600 disabled:opacity-60"
              >
                {saving ? "Guardando..." : "Agregar"}
              </button>
            </form>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-700">
                    <th className="px-2 py-1">Inversión</th>
                    <th className="px-2 py-1">Plataforma</th>
                    <th className="px-2 py-1 text-right">Invertido</th>
                    <th className="px-2 py-1 text-right">Valor actual</th>
                  </tr>
                </thead>
                <tbody>
                  {investments.map((i) => (
                    <tr
                      key={i.id}
                      className="border-b border-slate-100 dark:border-slate-800"
                    >
                      <td className="px-2 py-1">{i.name}</td>
                      <td className="px-2 py-1">{i.platform}</td>
                      <td className="px-2 py-1 text-right">
                        {formatMoney(i.invested_amount)}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {formatMoney(i.current_value)}
                      </td>
                    </tr>
                  ))}
                  {!investments.length && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-2 py-2 text-center text-slate-400"
                      >
                        Aún no registras inversiones.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
