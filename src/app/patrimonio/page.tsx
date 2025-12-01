"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ThemeToggle } from "@/components/ThemeToggle";

type Asset = {
  id: string;
  name: string;
  category: string | null;
  current_value: number | null;
  owner: string | null;
  notes: string | null;
  created_at?: string;
};

type DebtType = "HIPOTECA" | "AUTO" | "TARJETA" | "PERSONAL" | "OTRA";

type Debt = {
  id: string;
  name: string;
  type: DebtType;
  total_amount: number;
  notes: string | null;
  created_at?: string;
};

function formatMoney(num: number) {
  return num.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  });
}

export default function NetWorthPage() {
  // ---------- AUTH ----------
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");

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

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim(),
        password: authPassword,
      });
      if (error) {
        setAuthError(error.message);
        return;
      }
      setAuthEmail("");
      setAuthPassword("");
    } catch {
      setAuthError("No se pudo iniciar sesión.");
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signUp({
        email: authEmail.trim(),
        password: authPassword,
      });
      if (error) {
        setAuthError(error.message);
        return;
      }
      alert("Cuenta creada. Revisa tu correo si tienes verificación activada.");
      setAuthMode("login");
      setAuthPassword("");
    } catch {
      setAuthError("No se pudo crear la cuenta.");
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
    } catch (err) {
      console.error("Error cerrando sesión", err);
    }
  };

  // ---------- ESTADO PATRIMONIO ----------
  const [assets, setAssets] = useState<Asset[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [loadingDebts, setLoadingDebts] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [debtsError, setDebtsError] = useState<string | null>(null);

  const [assetForm, setAssetForm] = useState({
    name: "",
    category: "",
    currentValue: "",
    owner: "",
  });

  const [debtForm, setDebtForm] = useState({
    name: "",
    type: "HIPOTECA" as DebtType,
    totalAmount: "",
    notes: "",
  });

  const [savingAsset, setSavingAsset] = useState(false);
  const [savingDebt, setSavingDebt] = useState(false);

  // ---------- CARGAR ASSETS / DEBTS ----------
  useEffect(() => {
    if (!user) {
      setAssets([]);
      setDebts([]);
      return;
    }
    const userId = user.id;
    let cancelled = false;

    async function loadAssets() {
      setLoadingAssets(true);
      setAssetsError(null);
      try {
        const { data, error } = await supabase
          .from("assets")
          .select("id,name,category,current_value,owner,notes,created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

        if (error) throw error;
        if (!cancelled) setAssets((data ?? []) as Asset[]);
      } catch (err) {
        console.error("Error cargando activos", err);
        if (!cancelled) setAssetsError("No se pudieron cargar tus activos.");
      } finally {
        if (!cancelled) setLoadingAssets(false);
      }
    }

    async function loadDebts() {
      setLoadingDebts(true);
      setDebtsError(null);
      try {
        const { data, error } = await supabase
          .from("debts")
          .select("id,name,type,total_amount,notes,created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

        if (error) throw error;
        if (!cancelled) setDebts((data ?? []) as Debt[]);
      } catch (err) {
        console.error("Error cargando deudas", err);
        if (!cancelled) setDebtsError("No se pudieron cargar tus deudas.");
      } finally {
        if (!cancelled) setLoadingDebts(false);
      }
    }

    loadAssets();
    loadDebts();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // ---------- TOTALES ----------
  const totalActivos = useMemo(
    () => assets.reduce((sum, a) => sum + (a.current_value ?? 0), 0),
    [assets]
  );

  const totalDeudas = useMemo(
    () => debts.reduce((sum, d) => sum + (d.total_amount ?? 0), 0),
    [debts]
  );

  const patrimonioNeto = totalActivos - totalDeudas;

  // ---------- HANDLERS FORMULARIOS ----------
  const handleChangeAssetForm = (
    field: "name" | "category" | "currentValue" | "owner",
    value: string
  ) => {
    setAssetForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert("Debes iniciar sesión para guardar activos.");
      return;
    }

    const valueNumber = Number(assetForm.currentValue);
    if (!assetForm.name.trim()) {
      alert("Ponle un nombre al activo (ej. Casa, Auto, Ahorros…).");
      return;
    }
    if (!Number.isFinite(valueNumber) || valueNumber <= 0) {
      alert("Ingresa un valor válido mayor a 0.");
      return;
    }

    setSavingAsset(true);
    setAssetsError(null);

    try {
      const { data, error } = await supabase
        .from("assets")
        .insert({
          user_id: user.id,
          name: assetForm.name.trim(),
          category: assetForm.category.trim() || null,
          current_value: valueNumber,
          owner: assetForm.owner.trim() || null,
        })
        .select("id,name,category,current_value,owner,notes,created_at")
        .single();

      if (error) throw error;

      setAssets((prev) => [data as Asset, ...prev]);
      setAssetForm({
        name: "",
        category: "",
        currentValue: "",
        owner: "",
      });
    } catch (err) {
      console.error("Error guardando activo", err);
      setAssetsError("No se pudo guardar el activo.");
    } finally {
      setSavingAsset(false);
    }
  };

  const handleChangeDebtForm = (
    field: "name" | "type" | "totalAmount" | "notes",
    value: string
  ) => {
    setDebtForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert("Debes iniciar sesión para guardar deudas.");
      return;
    }

    const totalNumber = Number(debtForm.totalAmount);
    if (!debtForm.name.trim()) {
      alert("Ponle un nombre a la deuda (ej. Hipoteca casa, Tarjeta BBVA…).");
      return;
    }
    if (!Number.isFinite(totalNumber) || totalNumber <= 0) {
      alert("Ingresa un monto válido mayor a 0.");
      return;
    }

    setSavingDebt(true);
    setDebtsError(null);

    try {
      const { data, error } = await supabase
        .from("debts")
        .insert({
          user_id: user.id,
          name: debtForm.name.trim(),
          type: debtForm.type,
          total_amount: totalNumber,
          notes: debtForm.notes.trim() || null,
        })
        .select("id,name,type,total_amount,notes,created_at")
        .single();

      if (error) throw error;

      setDebts((prev) => [data as Debt, ...prev]);
      setDebtForm({
        name: "",
        type: "HIPOTECA",
        totalAmount: "",
        notes: "",
      });
    } catch (err) {
      console.error("Error guardando deuda", err);
      setDebtsError("No se pudo guardar la deuda.");
    } finally {
      setSavingDebt(false);
    }
  };

  // ---------- ESTADOS DE AUTH EN UI ----------
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
              <h1 className="text-lg font-semibold">Finanzas familiares</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Registra tus activos, deudas e inversiones.
              </p>
            </div>
            <ThemeToggle />
          </div>

          <h2 className="text-sm font-medium">
            {authMode === "login"
              ? "Inicia sesión para ver tu patrimonio"
              : "Crea tu cuenta"}
          </h2>

          <form
            onSubmit={authMode === "login" ? handleSignIn : handleSignUp}
            className="space-y-3 text-sm"
          >
            <div>
              <label className="mb-1 block text-xs text-gray-600 dark:text-gray-300">
                Correo electrónico
              </label>
              <input
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                placeholder="tucorreo@ejemplo.com"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-600 dark:text-gray-300">
                Contraseña
              </label>
              <input
                type="password"
                required
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            {authError && (
              <p className="text-xs text-red-500">{authError}</p>
            )}

            <button
              type="submit"
              className="w-full rounded-lg bg-sky-500 py-2 text-sm font-medium text-white transition hover:bg-sky-600"
            >
              {authMode === "login" ? "Entrar" : "Crear cuenta"}
            </button>
          </form>

          <div className="text-center text-xs text-gray-600 dark:text-gray-300">
            {authMode === "login" ? (
              <>
                ¿No tienes cuenta?{" "}
                <button
                  className="text-sky-600 underline"
                  onClick={() => {
                    setAuthMode("signup");
                    setAuthError(null);
                  }}
                >
                  Crear una nueva
                </button>
              </>
            ) : (
              <>
                ¿Ya tienes cuenta?{" "}
                <button
                  className="text-sky-600 underline"
                  onClick={() => {
                    setAuthMode("login");
                    setAuthError(null);
                  }}
                >
                  Inicia sesión
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------- RENDER PRINCIPAL ----------
  return (
    <main className="flex flex-1 flex-col gap-4">
      {/* Header con navegación */}
      <header className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold sm:text-xl">
            Patrimonio (activos y deudas)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Registra tus activos y deudas para calcular tu patrimonio neto
            familiar.
          </p>

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

            {/* pestaña activa */}
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

      {/* Resumen tarjetas */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-[11px] text-slate-500">Activos totales</div>
          <div className="mt-1 text-base font-semibold text-emerald-600 dark:text-emerald-400">
            {formatMoney(totalActivos)}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Suma de todos tus activos (casas, autos, ahorros, inversiones, etc.)
            registrados en tu patrimonio.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-[11px] text-slate-500">Deudas totales</div>
          <div className="mt-1 text-base font-semibold text-rose-600 dark:text-rose-400">
            {formatMoney(totalDeudas)}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Incluye hipotecas, autos, tarjetas y cualquier otra deuda
            registrada.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-[11px] text-slate-500">Patrimonio neto</div>
          <div
            className={`mt-1 text-base font-semibold ${
              patrimonioNeto >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {formatMoney(patrimonioNeto)}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Patrimonio neto = Activos totales - Deudas totales.
          </p>
        </div>
      </section>

      {/* Formularios y tablas */}
      <section className="grid gap-4 md:grid-cols-2">
        {/* Activos */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-2 text-sm font-semibold">Activos</h2>

          <form
            onSubmit={handleSaveAsset}
            className="mb-3 grid gap-2 md:grid-cols-[2fr_1.2fr_1.2fr_1.2fr_auto]"
          >
            <input
              type="text"
              value={assetForm.name}
              onChange={(e) =>
                handleChangeAssetForm("name", e.target.value)
              }
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Nombre del activo (Casa, Auto, Ahorros...)"
            />
            <input
              type="text"
              value={assetForm.category}
              onChange={(e) =>
                handleChangeAssetForm("category", e.target.value)
              }
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Categoría"
            />
            <input
              type="number"
              value={assetForm.currentValue}
              onChange={(e) =>
                handleChangeAssetForm("currentValue", e.target.value)
              }
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Valor actual"
            />
            <input
              type="text"
              value={assetForm.owner}
              onChange={(e) =>
                handleChangeAssetForm("owner", e.target.value)
              }
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Dueño (Papá, Mamá, Hijo...)"
            />
            <button
              type="submit"
              disabled={savingAsset}
              className="rounded-lg bg-emerald-500 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
            >
              {savingAsset ? "Guardando..." : "Agregar"}
            </button>
          </form>

          {assetsError && (
            <p className="mb-2 text-[11px] text-rose-500">{assetsError}</p>
          )}

          {loadingAssets && assets.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              Cargando activos registrados...
            </p>
          ) : assets.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              Aún no tienes activos registrados.
            </p>
          ) : (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-100 dark:border-slate-700">
              <table className="min-w-full text-[11px]">
                <thead className="bg-slate-50 dark:bg-slate-900/60">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium">
                      Activo
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Deudas */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-2 text-sm font-semibold">Deudas</h2>

          <form
            onSubmit={handleSaveDebt}
            className="mb-3 grid gap-2 md:grid-cols-[2fr_1.4fr_1.4fr]"
          >
            <input
              type="text"
              value={debtForm.name}
              onChange={(e) =>
                handleChangeDebtForm("name", e.target.value)
              }
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Nombre de la deuda (Hipoteca casa, Tarjeta BBVA...)"
            />

            <select
              value={debtForm.type}
              onChange={(e) =>
                handleChangeDebtForm("type", e.target.value as DebtType)
              }
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="HIPOTECA">Hipoteca</option>
              <option value="AUTO">Auto</option>
              <option value="TARJETA">Tarjeta de crédito</option>
              <option value="PERSONAL">Préstamo personal</option>
              <option value="OTRA">Otra</option>
            </select>

            <input
              type="number"
              value={debtForm.totalAmount}
              onChange={(e) =>
                handleChangeDebtForm("totalAmount", e.target.value)
              }
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Monto total de la deuda"
            />

            <textarea
              value={debtForm.notes}
              onChange={(e) =>
                handleChangeDebtForm("notes", e.target.value)
              }
              className="md:col-span-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Notas (plazo, tasa, banco...)"
              rows={2}
            />

            <div className="md:col-span-3 flex justify-end">
              <button
                type="submit"
                disabled={savingDebt}
                className="rounded-lg bg-rose-500 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-rose-600 disabled:opacity-60"
              >
                {savingDebt ? "Guardando..." : "Agregar deuda"}
              </button>
            </div>
          </form>

          {debtsError && (
            <p className="mb-2 text-[11px] text-rose-500">{debtsError}</p>
          )}

          {loadingDebts && debts.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              Cargando deudas registradas...
            </p>
          ) : debts.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              Aún no tienes deudas registradas.
            </p>
          ) : (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-100 dark:border-slate-700">
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
                      Monto total
                    </th>
                    <th className="px-2 py-1 text-left font-medium">
                      Notas
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
                      <td className="px-2 py-1">{d.type}</td>
                      <td className="px-2 py-1 text-right">
                        {formatMoney(d.total_amount ?? 0)}
                      </td>
                      <td className="px-2 py-1 max-w-xs truncate">
                        {d.notes ?? "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
