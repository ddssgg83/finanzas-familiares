"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useTheme } from "next-themes";
import { ThemeToggle } from "@/components/ThemeToggle";

export const dynamic = "force-dynamic";

type Asset = {
  id: string;
  name: string;
  category: string | null;
  current_value: number;
  owner: string | null;
  notes: string | null;
  family_member_id: string | null;
  created_at?: string;
};

type Debt = {
  id: string;
  name: string;
  category: string | null;
  type: string | null;
  total_amount: number;
  monthly_payment: number | null;
  interest_rate: number | null;
  due_date: string | null; // yyyy-mm-dd
  owner: string | null;
  notes: string | null;
  current_balance: number | null;
  family_member_id: string | null;
  created_at?: string;
};

// Formularios
type AssetForm = {
  name: string;
  category: string;
  currentValue: string;
  owner: string;
  notes: string;
};

type DebtForm = {
  name: string;
  category: string;
  type: string;
  totalAmount: string;
  monthlyPayment: string;
  interestRate: string;
  dueDate: string;
  owner: string;
  currentBalance: string;
  notes: string;
};

function formatMoney(num: number) {
  return num.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  });
}

function formatDateDisplay(ymd: string | null | undefined) {
  if (!ymd) return "-";
  const s = ymd.slice(0, 10);
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

export default function PatrimonioPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingAsset, setSavingAsset] = useState(false);
  const [savingDebt, setSavingDebt] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // IDs en edición
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editingDebtId, setEditingDebtId] = useState<string | null>(null);

  const [assetForm, setAssetForm] = useState<AssetForm>({
    name: "",
    category: "",
    currentValue: "",
    owner: "",
    notes: "",
  });

  const [debtForm, setDebtForm] = useState<DebtForm>({
    name: "",
    category: "",
    type: "",
    totalAmount: "",
    monthlyPayment: "",
    interestRate: "",
    dueDate: "",
    owner: "",
    currentBalance: "",
    notes: "",
  });

  const { theme, systemTheme } = useTheme();
  const [mountedTheme, setMountedTheme] = useState(false);
  useEffect(() => {
    setMountedTheme(true);
  }, []);
  const currentTheme = theme === "system" ? systemTheme : theme;
  const isDark = mountedTheme && currentTheme === "dark";

  // -------- AUTH --------
  useEffect(() => {
    let ignore = false;

    async function loadUser() {
      setAuthLoading(true);
      setAuthError(null);
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error && (error as any).name !== "AuthSessionMissingError") {
          console.error("Error obteniendo usuario actual", error);
        }
        if (!ignore) {
          setUser(data?.user ?? null);
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
  }, []);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setAssets([]);
      setDebts([]);
    } catch (err) {
      console.error("Error cerrando sesión", err);
    }
  };

  // -------- Cargar activos + deudas --------
  useEffect(() => {
    if (!user) {
      setAssets([]);
      setDebts([]);
      return;
    }

    const userId = user.id;

    async function loadPatrimonio() {
      setLoading(true);
      setError(null);
      try {
        const [assetsRes, debtsRes] = await Promise.all([
          supabase
            .from("assets")
            .select(
              "id,name,category,current_value,owner,notes,family_member_id,created_at"
            )
            .eq("user_id", userId)
            .order("created_at", { ascending: false }),
          supabase
            .from("debts")
            .select(
              "id,name,category,type,total_amount,monthly_payment,interest_rate,due_date,owner,notes,current_balance,family_member_id,created_at"
            )
            .eq("user_id", userId)
            .order("created_at", { ascending: false }),
        ]);

        if (assetsRes.error) {
          console.error("Error cargando activos", assetsRes.error);
          throw assetsRes.error;
        }
        if (debtsRes.error) {
          console.error("Error cargando deudas", debtsRes.error);
          throw debtsRes.error;
        }

        setAssets((assetsRes.data ?? []) as Asset[]);
        setDebts((debtsRes.data ?? []) as Debt[]);
      } catch (err) {
        console.error("Error cargando patrimonio", err);
        setError("No se pudieron cargar tus activos y deudas.");
      } finally {
        setLoading(false);
      }
    }

    loadPatrimonio();
  }, [user]);

  // -------- Cálculos --------
  const totalActivos = useMemo(
    () => assets.reduce((sum, a) => sum + (a.current_value ?? 0), 0),
    [assets]
  );

  const totalDeudas = useMemo(
    () =>
      debts.reduce(
        (sum, d) => sum + Number(d.current_balance ?? d.total_amount ?? 0),
        0
      ),
    [debts]
  );

  const patrimonioNeto = totalActivos - totalDeudas;

  const totalPagoMensualDeudas = useMemo(
    () =>
      debts.reduce((sum, d) => sum + Number(d.monthly_payment ?? 0), 0),
    [debts]
  );

  // -------- Handlers formularios --------
  const handleChangeAssetForm = (field: keyof AssetForm, value: string) => {
    setAssetForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleChangeDebtForm = (field: keyof DebtForm, value: string) => {
    setDebtForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetAssetForm = () => {
    setAssetForm({
      name: "",
      category: "",
      currentValue: "",
      owner: "",
      notes: "",
    });
    setEditingAssetId(null);
  };

  const resetDebtForm = () => {
    setDebtForm({
      name: "",
      category: "",
      type: "",
      totalAmount: "",
      monthlyPayment: "",
      interestRate: "",
      dueDate: "",
      owner: "",
      currentBalance: "",
      notes: "",
    });
    setEditingDebtId(null);
  };

  const handleSaveAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert("Debes iniciar sesión para registrar activos.");
      return;
    }

    const valueNumber = Number(assetForm.currentValue);
    if (!assetForm.name.trim()) {
      alert("Ponle un nombre al activo (Casa, Auto, Ahorros, etc.).");
      return;
    }
    if (!Number.isFinite(valueNumber) || valueNumber <= 0) {
      alert("Ingresa un valor actual válido mayor a 0.");
      return;
    }

    setSavingAsset(true);

    try {
      if (editingAssetId) {
        // UPDATE
        const { data, error } = await supabase
          .from("assets")
          .update({
            name: assetForm.name.trim(),
            category: assetForm.category.trim() || null,
            current_value: valueNumber,
            owner: assetForm.owner.trim() || null,
            notes: assetForm.notes.trim() || null,
          })
          .eq("id", editingAssetId)
          .eq("user_id", user.id)
          .select(
            "id,name,category,current_value,owner,notes,family_member_id,created_at"
          )
          .single();

        if (error) throw error;

        setAssets((prev) =>
          prev.map((a) => (a.id === editingAssetId ? (data as Asset) : a))
        );
        resetAssetForm();
      } else {
        // INSERT
        const { data, error } = await supabase
          .from("assets")
          .insert({
            user_id: user.id,
            name: assetForm.name.trim(),
            category: assetForm.category.trim() || null,
            current_value: valueNumber,
            owner: assetForm.owner.trim() || null,
            notes: assetForm.notes.trim() || null,
            family_member_id: null, // por ahora no lo usamos en formulario
          })
          .select(
            "id,name,category,current_value,owner,notes,family_member_id,created_at"
          )
          .single();

        if (error) throw error;

        setAssets((prev) => [data as Asset, ...prev]);
        resetAssetForm();
      }
    } catch (err) {
      console.error("Error guardando activo", err);
      alert("No se pudo guardar el activo.");
    } finally {
      setSavingAsset(false);
    }
  };

  const handleSaveDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert("Debes iniciar sesión para registrar deudas.");
      return;
    }

    if (!debtForm.name.trim()) {
      alert(
        "Ponle un nombre a la deuda (Hipoteca casa, Auto, Tarjeta BBVA, etc.)."
      );
      return;
    }

    const totalAmount = Number(debtForm.totalAmount);
    const monthlyPayment = debtForm.monthlyPayment
      ? Number(debtForm.monthlyPayment)
      : null;
    const interestRate = debtForm.interestRate
      ? Number(debtForm.interestRate)
      : null;
    const currentBalance = debtForm.currentBalance
      ? Number(debtForm.currentBalance)
      : null;

    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      alert("Ingresa un monto total válido mayor a 0.");
      return;
    }

    setSavingDebt(true);

    try {
      if (editingDebtId) {
        // UPDATE
        const { data, error } = await supabase
          .from("debts")
          .update({
            name: debtForm.name.trim(),
            category: debtForm.category.trim() || null,
            type: debtForm.type.trim() || null,
            total_amount: totalAmount,
            monthly_payment: monthlyPayment,
            interest_rate: interestRate,
            due_date: debtForm.dueDate || null,
            owner: debtForm.owner.trim() || null,
            current_balance: currentBalance,
            notes: debtForm.notes.trim() || null,
          })
          .eq("id", editingDebtId)
          .eq("user_id", user.id)
          .select(
            "id,name,category,type,total_amount,monthly_payment,interest_rate,due_date,owner,notes,current_balance,family_member_id,created_at"
          )
          .single();

        if (error) throw error;

        setDebts((prev) =>
          prev.map((d) => (d.id === editingDebtId ? (data as Debt) : d))
        );
        resetDebtForm();
      } else {
        // INSERT
        const { data, error } = await supabase
          .from("debts")
          .insert({
            user_id: user.id,
            name: debtForm.name.trim(),
            category: debtForm.category.trim() || null,
            type: debtForm.type.trim() || null,
            total_amount: totalAmount,
            monthly_payment: monthlyPayment,
            interest_rate: interestRate,
            due_date: debtForm.dueDate || null,
            owner: debtForm.owner.trim() || null,
            current_balance: currentBalance,
            notes: debtForm.notes.trim() || null,
            family_member_id: null, // por ahora no lo usamos en formulario
          })
          .select(
            "id,name,category,type,total_amount,monthly_payment,interest_rate,due_date,owner,notes,current_balance,family_member_id,created_at"
          )
          .single();

        if (error) throw error;

        setDebts((prev) => [data as Debt, ...prev]);
        resetDebtForm();
      }
    } catch (err) {
      console.error("Error guardando deuda", err);
      alert("No se pudo guardar la deuda.");
    } finally {
      setSavingDebt(false);
    }
  };

  // -------- Editar / eliminar --------
  const handleEditAsset = (asset: Asset) => {
    setAssetForm({
      name: asset.name ?? "",
      category: asset.category ?? "",
      currentValue:
        asset.current_value != null ? String(asset.current_value) : "",
      owner: asset.owner ?? "",
      notes: asset.notes ?? "",
    });
    setEditingAssetId(asset.id);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleEditDebt = (debt: Debt) => {
    setDebtForm({
      name: debt.name ?? "",
      category: debt.category ?? "",
      type: debt.type ?? "",
      totalAmount:
        debt.total_amount != null ? String(debt.total_amount) : "",
      monthlyPayment:
        debt.monthly_payment != null ? String(debt.monthly_payment) : "",
      interestRate:
        debt.interest_rate != null ? String(debt.interest_rate) : "",
      dueDate: debt.due_date ?? "",
      owner: debt.owner ?? "",
      currentBalance:
        debt.current_balance != null
          ? String(debt.current_balance)
          : "",
      notes: debt.notes ?? "",
    });
    setEditingDebtId(debt.id);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleDeleteAsset = async (asset: Asset) => {
    if (!user) {
      alert("Debes iniciar sesión para eliminar activos.");
      return;
    }
    if (!confirm(`¿Eliminar el activo "${asset.name}"?`)) return;

    try {
      const { error } = await supabase
        .from("assets")
        .delete()
        .eq("id", asset.id)
        .eq("user_id", user.id);

      if (error) throw error;

      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
      if (editingAssetId === asset.id) {
        resetAssetForm();
      }
    } catch (err) {
      console.error("Error eliminando activo", err);
      alert("No se pudo eliminar el activo.");
    }
  };

  const handleDeleteDebt = async (debt: Debt) => {
    if (!user) {
      alert("Debes iniciar sesión para eliminar deudas.");
      return;
    }
    if (!confirm(`¿Eliminar la deuda "${debt.name}"?`)) return;

    try {
      const { error } = await supabase
        .from("debts")
        .delete()
        .eq("id", debt.id)
        .eq("user_id", user.id);

      if (error) throw error;

      setDebts((prev) => prev.filter((d) => d.id !== debt.id));
      if (editingDebtId === debt.id) {
        resetDebtForm();
      }
    } catch (err) {
      console.error("Error eliminando deuda", err);
      alert("No se pudo eliminar la deuda.");
    }
  };

  // -------- UI AUTH --------
  if (authLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-sm text-slate-600 dark:text-slate-300">
        Cargando sesión...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">Patrimonio familiar</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inicia sesión para ver y registrar activos y deudas.
              </p>
            </div>
            <ThemeToggle />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Ve al dashboard principal para iniciar sesión.
          </p>
          {authError && (
            <p className="text-xs text-red-500">{authError}</p>
          )}
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-sky-500 px-4 py-2 text-xs font-medium text-white hover:bg-sky-600"
          >
            Ir al dashboard
          </Link>
        </div>
      </div>
    );
  }

  // -------- UI PATRIMONIO --------
  return (
    <main className="flex flex-1 flex-col gap-4">
      {/* Header con navegación */}
      <header className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold sm:text-xl">
            Patrimonio familiar
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Aquí llevas el control de tus activos (lo que tienes) y tus deudas
            (lo que debes).
          </p>

          {/* Navegación */}
          <nav className="mt-2 flex flex-wrap gap-2 text-[11px]">
            <Link
              href="/"
              className="rounded-full border border-slate-200 px-3 py-1 text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Dashboard
            </Link>
            <Link
              href="/gastos"
              className="rounded-full border border-slate-200 px-3 py-1 text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Gastos e ingresos
            </Link>
            <span className="rounded-full bg-slate-900 px-3 py-1 font-medium text-white dark:bg-slate-100 dark:text-slate-900">
              Patrimonio
            </span>
            <Link
              href="/aprende"
              className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 font-medium text-amber-700 transition hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200"
            >
              Aprende finanzas
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <span className="hidden text-[11px] text-slate-500 sm:inline">
            {user.email}
          </span>
          <button
            onClick={handleSignOut}
            className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      {/* Resumen */}
      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Activos totales
          </div>
          <div className="mt-1 text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
            {formatMoney(totalActivos)}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Casas, autos, ahorros, inversiones, etc.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Deudas totales
          </div>
          <div className="mt-1 text-2xl font-semibold text-rose-600 dark:text-rose-400">
            {formatMoney(totalDeudas)}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Hipotecas, autos, tarjetas y demás compromisos.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Patrimonio neto
          </div>
          <div
            className={`mt-1 text-2xl font-semibold ${
              patrimonioNeto >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {formatMoney(patrimonioNeto)}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Activos – Deudas.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Pago mensual fijo de deudas
          </div>
          <div className="mt-1 text-2xl font-semibold text-amber-600 dark:text-amber-400">
            {formatMoney(totalPagoMensualDeudas)}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Suma de todos los pagos mensuales que definiste en tus deudas.
          </p>
        </div>
      </section>

      {/* Formularios + tablas */}
      <section className="grid gap-4 lg:grid-cols-2">
        {/* Activos */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Activos</h2>
            {editingAssetId && (
              <span className="text-[11px] text-amber-500">
                Editando activo...
              </span>
            )}
          </div>
          <p className="mb-3 text-[11px] text-slate-500 dark:text-slate-400">
            Registra todo lo que tienes a tu nombre o de tu familia: propiedades, autos,
            cuentas, inversiones, etc.
          </p>

          <form
            onSubmit={handleSaveAsset}
            className="mb-3 grid gap-2 text-xs md:grid-cols-[2fr_1.5fr_1.5fr_1.5fr]"
          >
            <input
              type="text"
              value={assetForm.name}
              onChange={(e) =>
                handleChangeAssetForm("name", e.target.value)
              }
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Nombre (Casa, Auto, Ahorros...)"
            />
            <input
              type="text"
              value={assetForm.category}
              onChange={(e) =>
                handleChangeAssetForm("category", e.target.value)
              }
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Categoría (Propiedad, Efectivo, Inversión...)"
            />
            <input
              type="number"
              value={assetForm.currentValue}
              onChange={(e) =>
                handleChangeAssetForm("currentValue", e.target.value)
              }
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Valor actual"
            />
            <input
              type="text"
              value={assetForm.owner}
              onChange={(e) =>
                handleChangeAssetForm("owner", e.target.value)
              }
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Dueño (Papá, Mamá, Hijo...)"
            />
            <textarea
              value={assetForm.notes}
              onChange={(e) =>
                handleChangeAssetForm("notes", e.target.value)
              }
              className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 md:col-span-4"
              placeholder="Notas (ubicación, institución, algún detalle, etc.)"
            />
            <div className="mt-1 flex items-center gap-2 md:col-span-4">
              <button
                type="submit"
                disabled={savingAsset}
                className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-3 py-1 text-[11px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
              >
                {savingAsset
                  ? "Guardando..."
                  : editingAssetId
                  ? "Guardar cambios"
                  : "Agregar activo"}
              </button>
              {editingAssetId && (
                <button
                  type="button"
                  onClick={resetAssetForm}
                  className="text-[11px] text-slate-400 hover:underline"
                >
                  Cancelar edición
                </button>
              )}
            </div>
          </form>

          {loading && assets.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              Cargando activos...
            </p>
          ) : assets.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              Aún no tienes activos registrados.
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-100 dark:border-slate-700">
              <table className="min-w-full text-[11px]">
                <thead className="bg-slate-50 dark:bg-slate-900/60">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium">
                      Nombre
                    </th>
                    <th className="px-2 py-1 text-left font-medium">
                      Categoría
                    </th>
                    <th className="px-2 py-1 text-left font-medium">
                      Dueño
                    </th>
                    <th className="px-2 py-1 text-right font-medium">
                      Valor
                    </th>
                    <th className="px-2 py-1 text-center font-medium">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a) => (
                    <tr
                      key={a.id}
                      className="odd:bg-white even:bg-slate-50 dark:odd:bg-slate-900 dark:even:bg-slate-800"
                    >
                      <td className="px-2 py-1">{a.name}</td>
                      <td className="px-2 py-1">{a.category ?? "-"}</td>
                      <td className="px-2 py-1">{a.owner ?? "-"}</td>
                      <td className="px-2 py-1 text-right">
                        {formatMoney(a.current_value ?? 0)}
                      </td>
                      <td className="px-2 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleEditAsset(a)}
                          className="mr-2 text-[10px] text-sky-600 hover:underline"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAsset(a)}
                          className="text-[10px] text-rose-600 hover:underline"
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

        {/* Deudas */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Deudas</h2>
            {editingDebtId && (
              <span className="text-[11px] text-amber-500">
                Editando deuda...
              </span>
            )}
          </div>
          <p className="mb-3 text-[11px] text-slate-500 dark:text-slate-400">
            Registra hipotecas, créditos de auto, tarjetas y cualquier otro
            compromiso. El campo de pago mensual te ayuda a ver la carga fija al
            mes.
          </p>

          <form
            onSubmit={handleSaveDebt}
            className="mb-3 grid gap-2 text-xs md:grid-cols-3"
          >
            <input
              type="text"
              value={debtForm.name}
              onChange={(e) =>
                handleChangeDebtForm("name", e.target.value)
              }
              className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Nombre (Hipoteca casa, Tarjeta BBVA...)"
            />
            <input
              type="text"
              value={debtForm.type}
              onChange={(e) =>
                handleChangeDebtForm("type", e.target.value)
              }
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Tipo (Hipoteca, Auto, Tarjeta...)"
            />
            <input
              type="text"
              value={debtForm.category}
              onChange={(e) =>
                handleChangeDebtForm("category", e.target.value)
              }
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Categoría (Banco, Tienda, etc.)"
            />
            <input
              type="number"
              value={debtForm.totalAmount}
              onChange={(e) =>
                handleChangeDebtForm("totalAmount", e.target.value)
              }
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Monto total"
            />
            <input
              type="number"
              value={debtForm.currentBalance}
              onChange={(e) =>
                handleChangeDebtForm("currentBalance", e.target.value)
              }
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Saldo actual"
            />
            <input
              type="number"
              value={debtForm.monthlyPayment}
              onChange={(e) =>
                handleChangeDebtForm("monthlyPayment", e.target.value)
              }
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Pago mensual fijo"
            />
            <input
              type="number"
              step="0.01"
              value={debtForm.interestRate}
              onChange={(e) =>
                handleChangeDebtForm("interestRate", e.target.value)
              }
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Tasa interés (%)"
            />
            <input
              type="date"
              value={debtForm.dueDate}
              onChange={(e) =>
                handleChangeDebtForm("dueDate", e.target.value)
              }
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Fecha de vencimiento"
            />
            <input
              type="text"
              value={debtForm.owner}
              onChange={(e) =>
                handleChangeDebtForm("owner", e.target.value)
              }
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="De quién es la deuda"
            />
            <textarea
              value={debtForm.notes}
              onChange={(e) =>
                handleChangeDebtForm("notes", e.target.value)
              }
              className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 md:col-span-3"
              placeholder="Notas (institución, condiciones, etc.)"
            />
            <div className="mt-1 flex items-center gap-2 md:col-span-3">
              <button
                type="submit"
                disabled={savingDebt}
                className="inline-flex items-center justify-center rounded-lg bg-rose-500 px-3 py-1 text-[11px] font-semibold text-white hover:bg-rose-600 disabled:opacity-60"
              >
                {savingDebt
                  ? "Guardando..."
                  : editingDebtId
                  ? "Guardar cambios"
                  : "Agregar deuda"}
              </button>
              {editingDebtId && (
                <button
                  type="button"
                  onClick={resetDebtForm}
                  className="text-[11px] text-slate-400 hover:underline"
                >
                  Cancelar edición
                </button>
              )}
            </div>
          </form>

          {loading && debts.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              Cargando deudas...
            </p>
          ) : debts.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              Aún no tienes deudas registradas.
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-100 dark:border-slate-700">
              <table className="min-w-full text-[11px]">
                <thead className="bg-slate-50 dark:bg-slate-900/60">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium">
                      Deuda
                    </th>
                    <th className="px-2 py-1 text-left font-medium">
                      Tipo
                    </th>
                    <th className="px-2 py-1 text-right font-medium">
                      Total
                    </th>
                    <th className="px-2 py-1 text-right font-medium">
                      Saldo
                    </th>
                    <th className="px-2 py-1 text-right font-medium">
                      Pago mensual
                    </th>
                    <th className="px-2 py-1 text-left font-medium">
                      Vence
                    </th>
                    <th className="px-2 py-1 text-center font-medium">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {debts.map((d) => (
                    <tr
                      key={d.id}
                      className="odd:bg-white even:bg-slate-50 dark:odd:bg-slate-900 dark:even:bg-slate-800"
                    >
                      <td className="px-2 py-1">{d.name}</td>
                      <td className="px-2 py-1">
                        {d.type || d.category || "-"}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {formatMoney(d.total_amount ?? 0)}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {formatMoney(
                          d.current_balance ?? d.total_amount ?? 0
                        )}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {formatMoney(d.monthly_payment ?? 0)}
                      </td>
                      <td className="px-2 py-1">
                        {formatDateDisplay(d.due_date)}
                      </td>
                      <td className="px-2 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleEditDebt(d)}
                          className="mr-2 text-[10px] text-sky-600 hover:underline"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDebt(d)}
                          className="text-[10px] text-rose-600 hover:underline"
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

      {error && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </section>
      )}
    </main>
  );
}
