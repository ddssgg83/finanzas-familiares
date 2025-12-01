"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

// ====== Tipos ======
type Asset = {
  id: string;
  user_id: string;
  name: string;
  category: string;
  current_value: number;
  notes?: string | null;
  created_at?: string;
};

type Debt = {
  id: string;
  user_id: string;
  name: string;
  type: string;
  total_amount: number;
  notes?: string | null;
  created_at?: string;
};

type AssetFormState = {
  name: string;
  category: string;
  current_value: string;
  notes: string;
};

type DebtFormState = {
  name: string;
  type: string;
  total_amount: string;
  notes: string;
};

const ASSET_CATEGORIES = [
  { label: "Efectivo / Cuentas bancarias", value: "efectivo" },
  { label: "Inversiones", value: "inversion" },
  { label: "Propiedades", value: "propiedad" },
  { label: "Autos", value: "auto" },
  { label: "Negocios / Empresas", value: "negocio" },
  { label: "Otros", value: "otro" },
];

const DEBT_TYPES = [
  { label: "Hipoteca", value: "hipoteca" },
  { label: "Crédito automotriz", value: "auto" },
  { label: "Tarjeta de crédito", value: "tarjeta" },
  { label: "Préstamo personal", value: "personal" },
  { label: "Otros", value: "otro" },
];

export default function NetWorthPage() {
  const [user, setUser] = useState<User | null>(null);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);

  const [assetForm, setAssetForm] = useState<AssetFormState>({
    name: "",
    category: "efectivo",
    current_value: "",
    notes: "",
  });

  const [debtForm, setDebtForm] = useState<DebtFormState>({
    name: "",
    type: "hipoteca",
    total_amount: "",
    notes: "",
  });

  const [loading, setLoading] = useState(true);
  const [savingAsset, setSavingAsset] = useState(false);
  const [savingDebt, setSavingDebt] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ====== Cargar usuario y datos ======
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError(null);
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;
        if (!user) {
          setUser(null);
          setAssets([]);
          setDebts([]);
          return;
        }

        setUser(user);

        const [assetsRes, debtsRes] = await Promise.all([
          supabase
            .from("assets")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false }),
          supabase
            .from("debts")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false }),
        ]);

        if (assetsRes.error) throw assetsRes.error;
        if (debtsRes.error) throw debtsRes.error;

        setAssets((assetsRes.data || []) as Asset[]);
        setDebts((debtsRes.data || []) as Debt[]);
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? "Error al cargar la información");
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  // ====== Cálculos ======
  const totalAssets = useMemo(
    () => assets.reduce((sum, a) => sum + (a.current_value || 0), 0),
    [assets]
  );

  const totalDebts = useMemo(
    () => debts.reduce((sum, d) => sum + (d.total_amount || 0), 0),
    [debts]
  );

  const netWorth = useMemo(
    () => totalAssets - totalDebts,
    [totalAssets, totalDebts]
  );

  const formatCurrency = (value: number) =>
    value.toLocaleString("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 2,
    });

  // ====== Handlers: Activos ======
  const handleAssetChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setAssetForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError("No hay usuario autenticado.");
      return;
    }
    setError(null);

    const value = parseFloat(assetForm.current_value.replace(",", ""));
    if (isNaN(value) || value <= 0) {
      setError("El valor del activo debe ser un número mayor a 0.");
      return;
    }

    setSavingAsset(true);
    try {
      const { data, error: insertError } = await supabase
        .from("assets")
        .insert({
          user_id: user.id,
          name: assetForm.name.trim(),
          category: assetForm.category,
          current_value: value,
          notes: assetForm.notes.trim() || null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setAssets((prev) => [data as Asset, ...prev]);

      setAssetForm({
        name: "",
        category: "efectivo",
        current_value: "",
        notes: "",
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "Error al guardar el activo");
    } finally {
      setSavingAsset(false);
    }
  };

  const handleDeleteAsset = async (id: string) => {
    if (!confirm("¿Seguro que quieres eliminar este activo?")) return;
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from("assets")
        .delete()
        .eq("id", id);

      if (deleteError) throw deleteError;

      setAssets((prev) => prev.filter((a) => a.id !== id));
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "Error al eliminar el activo");
    }
  };

  // ====== Handlers: Deudas ======
  const handleDebtChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setDebtForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError("No hay usuario autenticado.");
      return;
    }
    setError(null);

    const value = parseFloat(debtForm.total_amount.replace(",", ""));
    if (isNaN(value) || value <= 0) {
      setError("El monto de la deuda debe ser un número mayor a 0.");
      return;
    }

    setSavingDebt(true);
    try {
      const { data, error: insertError } = await supabase
        .from("debts")
        .insert({
          user_id: user.id,
          name: debtForm.name.trim(),
          type: debtForm.type,
          total_amount: value,
          notes: debtForm.notes.trim() || null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setDebts((prev) => [data as Debt, ...prev]);

      setDebtForm({
        name: "",
        type: "hipoteca",
        total_amount: "",
        notes: "",
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "Error al guardar la deuda");
    } finally {
      setSavingDebt(false);
    }
  };

  const handleDeleteDebt = async (id: string) => {
    if (!confirm("¿Seguro que quieres eliminar esta deuda?")) return;
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from("debts")
        .delete()
        .eq("id", id);

      if (deleteError) throw deleteError;

      setDebts((prev) => prev.filter((d) => d.id !== id));
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "Error al eliminar la deuda");
    }
  };

  // ====== UI ======
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando patrimonio...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">
          Necesitas iniciar sesión para ver tu patrimonio.
        </p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 px-4 py-6 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Patrimonio (Activos y Deudas)
            </h1>
            <p className="text-sm text-slate-500">
              Registra tus activos y deudas para calcular tu patrimonio neto.
            </p>
          </div>
        </header>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Resumen */}
        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Activos totales
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {formatCurrency(totalAssets)}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Deudas totales
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {formatCurrency(totalDebts)}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Patrimonio neto
            </p>
            <p
              className={`mt-2 text-2xl font-semibold ${
                netWorth < 0 ? "text-red-600" : "text-emerald-600"
              }`}
            >
              {formatCurrency(netWorth)}
            </p>
          </div>
        </section>

        {/* Formularios */}
        <section className="grid gap-6 lg:grid-cols-2">
          {/* Formulario Activos */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Agregar activo</h2>
            <form className="space-y-3" onSubmit={handleAddAsset}>
              <div className="space-y-1">
                <label className="text-sm font-medium">
                  Nombre del activo
                </label>
                <input
                  type="text"
                  name="name"
                  value={assetForm.name}
                  onChange={handleAssetChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Cuenta bancaria, casa, auto, inversión..."
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Categoría</label>
                <select
                  name="category"
                  value={assetForm.category}
                  onChange={handleAssetChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {ASSET_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">
                  Valor actual (MXN)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  name="current_value"
                  value={assetForm.current_value}
                  onChange={handleAssetChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="0.00"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">
                  Notas (opcional)
                </label>
                <textarea
                  name="notes"
                  value={assetForm.notes}
                  onChange={handleAssetChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  rows={2}
                />
              </div>

              <button
                type="submit"
                disabled={savingAsset}
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {savingAsset ? "Guardando..." : "Agregar activo"}
              </button>
            </form>
          </div>

          {/* Formulario Deudas */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Agregar deuda</h2>
            <form className="space-y-3" onSubmit={handleAddDebt}>
              <div className="space-y-1">
                <label className="text-sm font-medium">
                  Nombre de la deuda
                </label>
                <input
                  type="text"
                  name="name"
                  value={debtForm.name}
                  onChange={handleDebtChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Hipoteca casa, crédito auto, tarjeta BBVA..."
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Tipo</label>
                <select
                  name="type"
                  value={debtForm.type}
                  onChange={handleDebtChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {DEBT_TYPES.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">
                  Monto total de la deuda (MXN)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  name="total_amount"
                  value={debtForm.total_amount}
                  onChange={handleDebtChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="0.00"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">
                  Notas (opcional)
                </label>
                <textarea
                  name="notes"
                  value={debtForm.notes}
                  onChange={handleDebtChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  rows={2}
                />
              </div>

              <button
                type="submit"
                disabled={savingDebt}
                className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {savingDebt ? "Guardando..." : "Agregar deuda"}
              </button>
            </form>
          </div>
        </section>

        {/* Tablas */}
        <section className="grid gap-6 lg:grid-cols-2">
          {/* Tabla activos */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Activos registrados</h2>
              <span className="text-sm text-slate-500">
                {assets.length} registro(s)
              </span>
            </div>
            {assets.length === 0 ? (
              <p className="text-sm text-slate-500">
                Aún no has agregado activos.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                      <th className="py-2 pr-4">Nombre</th>
                      <th className="py-2 pr-4">Categoría</th>
                      <th className="py-2 pr-4">Valor</th>
                      <th className="py-2 pr-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assets.map((asset) => (
                      <tr
                        key={asset.id}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="py-2 pr-4">{asset.name}</td>
                        <td className="py-2 pr-4 capitalize">
                          {asset.category}
                        </td>
                        <td className="py-2 pr-4">
                          {formatCurrency(asset.current_value)}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          <button
                            onClick={() => handleDeleteAsset(asset.id)}
                            className="text-xs font-medium text-red-600 hover:underline"
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Tabla deudas */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Deudas registradas</h2>
              <span className="text-sm text-slate-500">
                {debts.length} registro(s)
              </span>
            </div>
            {debts.length === 0 ? (
              <p className="text-sm text-slate-500">
                Aún no has agregado deudas.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                      <th className="py-2 pr-4">Nombre</th>
                      <th className="py-2 pr-4">Tipo</th>
                      <th className="py-2 pr-4">Monto</th>
                      <th className="py-2 pr-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {debts.map((debt) => (
                      <tr
                        key={debt.id}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="py-2 pr-4">{debt.name}</td>
                        <td className="py-2 pr-4 capitalize">{debt.type}</td>
                        <td className="py-2 pr-4">
                          {formatCurrency(debt.total_amount)}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          <button
                            onClick={() => handleDeleteDebt(debt.id)}
                            className="text-xs font-medium text-red-600 hover:underline"
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
