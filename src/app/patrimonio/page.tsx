"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

// =========================================================
//  Tipos
// =========================================================

type Asset = {
  id: string;
  name: string;
  category: string | null;
  current_value: number | null;
  owner: string | null;
  notes: string | null;
  created_at?: string;
  user_id?: string | null;
  family_id?: string | null;
};

type Debt = {
  id: string;
  name: string;
  type: string;
  total_amount: number;
  current_balance: number | null;
  notes: string | null;
  created_at?: string;
  user_id?: string | null;
  family_id?: string | null;
};

type AssetForm = {
  name: string;
  category: string;
  current_value: string;
  owner: string;
  notes: string;
};

type DebtForm = {
  name: string;
  type: string;
  total_amount: string;
  current_balance: string;
  notes: string;
};

type FamilyContext = {
  familyId: string;
  familyName: string;
  ownerUserId: string;
  activeMembers: number;
  activeMemberUserIds: string[];
};

type ViewScope = "personal" | "family";

const ASSET_CATEGORIES = [
  "Cuenta bancaria",
  "Inversión",
  "Casa / Departamento",
  "Terreno",
  "Automóvil",
  "Negocio",
  "Ahorro niños",
  "Otro",
];

const DEBT_TYPES = [
  "Tarjeta de crédito",
  "Crédito hipotecario",
  "Crédito automotriz",
  "Préstamo personal",
  "Préstamo familiar",
  "Crédito negocio",
  "Otro",
];

// =========================================================
//  Helpers
// =========================================================

function formatMoney(num: number) {
  return num.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  });
}

function formatDateDisplay(ymd?: string | null) {
  if (!ymd) return "";
  const s = ymd.slice(0, 10);
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

// =========================================================
//  Página principal
// =========================================================

export default function PatrimonioPage() {
  // -------- AUTH --------
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // -------- FAMILY CONTEXT --------
  const [familyCtx, setFamilyCtx] = useState<FamilyContext | null>(null);
  const [familyLoading, setFamilyLoading] = useState(false);
  const [familyError, setFamilyError] = useState<string | null>(null);

  // Vista: sólo yo vs familia (para jefes de familia)
  const [viewScope, setViewScope] = useState<ViewScope>("personal");

  // -------- DATA PATRIMONIO --------
  const [assets, setAssets] = useState<Asset[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loadingPatrimonio, setLoadingPatrimonio] = useState(false);
  const [patrimonioError, setPatrimonioError] = useState<string | null>(null);

  // Formularios
  const [assetForm, setAssetForm] = useState<AssetForm>({
    name: "",
    category: "Cuenta bancaria",
    current_value: "",
    owner: "",
    notes: "",
  });

  const [debtForm, setDebtForm] = useState<DebtForm>({
    name: "",
    type: "Tarjeta de crédito",
    total_amount: "",
    current_balance: "",
    notes: "",
  });

  const [savingAsset, setSavingAsset] = useState(false);
  const [savingDebt, setSavingDebt] = useState(false);

  // =========================================================
  //  1. AUTH
  // =========================================================
  useEffect(() => {
    let ignore = false;

    async function loadUser() {
      setAuthLoading(true);
      setAuthError(null);
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error && (error as any).name !== "AuthSessionMissingError") {
          console.error("Error obteniendo usuario actual", error);
          if (!ignore) {
            setAuthError("Hubo un problema al cargar tu sesión.");
          }
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
      setFamilyCtx(null);
      setAssets([]);
      setDebts([]);
    } catch (err) {
      console.error("Error cerrando sesión", err);
    }
  };

  // =========================================================
  //  2. FAMILY CONTEXT (saber si eres jefe de familia)
  // =========================================================
  useEffect(() => {
    const currentUser = user;
    if (!currentUser) {
      setFamilyCtx(null);
      setFamilyError(null);
      setFamilyLoading(false);
      return;
    }

    const userId = currentUser.id;
    const email = (currentUser.email ?? "").toLowerCase();
    let cancelled = false;

    const loadFamily = async () => {
      setFamilyLoading(true);
      setFamilyError(null);
      try {
        // 1) Buscar membresía activa por user_id o invited_email
        const { data: memberRows, error: memberError } = await supabase
          .from("family_members")
          .select("id,family_id,status,user_id,invited_email")
          .or(`user_id.eq.${userId},invited_email.eq.${email}`)
          .eq("status", "active")
          .limit(1);

        if (memberError) throw memberError;

        if (!memberRows || memberRows.length === 0) {
          if (!cancelled) setFamilyCtx(null);
          return;
        }

        const member = memberRows[0];

        // 2) Cargar familia
        const { data: fam, error: famError } = await supabase
          .from("families")
          .select("id,name,user_id")
          .eq("id", member.family_id)
          .single();

        if (famError) throw famError;

        // 3) Cargar todos los miembros activos para saber sus user_id
        const { data: activeMembers, error: membersError } = await supabase
          .from("family_members")
          .select("id,status,user_id")
          .eq("family_id", fam.id)
          .eq("status", "active");

        if (membersError) throw membersError;

        const activeMemberUserIds = (activeMembers ?? [])
          .map((m) => m.user_id)
          .filter((id): id is string => !!id);

        if (!cancelled) {
          setFamilyCtx({
            familyId: fam.id,
            familyName: fam.name,
            ownerUserId: fam.user_id,
            activeMembers: activeMembers?.length ?? 0,
            activeMemberUserIds,
          });
        }
      } catch (err) {
        console.error("Error cargando familia en Patrimonio:", err);
        if (!cancelled) {
          setFamilyError(
            "No se pudo cargar la información de tu familia. Revisa la sección Familia."
          );
          setFamilyCtx(null);
        }
      } finally {
        if (!cancelled) setFamilyLoading(false);
      }
    };

    loadFamily();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const isFamilyOwner =
    !!familyCtx && !!user && familyCtx.ownerUserId === user.id;

  // Si NO eres jefe de familia, la vista efectiva siempre es "personal"
  const effectiveScope: ViewScope =
    familyCtx && isFamilyOwner ? viewScope : "personal";

  // =========================================================
  //  3. Cargar patrimonio (activos + deudas)
  // =========================================================
  useEffect(() => {
    async function loadPatrimonio() {
      if (!user) {
        setAssets([]);
        setDebts([]);
        return;
      }

      const userId = user.id;

      try {
        setLoadingPatrimonio(true);
        setPatrimonioError(null);

        const isFamilyView =
          Boolean(familyCtx) && isFamilyOwner && viewScope === "family";

        const [assetsRes, debtsRes] = await Promise.all([
          supabase
            .from("assets")
            .select(
              "id,name,category,current_value,owner,notes,created_at,family_id,user_id"
            )
            .match(
              isFamilyView
                ? { family_id: familyCtx!.familyId }
                : { user_id: userId }
            ),
          supabase
            .from("debts")
            .select(
              "id,name,type,total_amount,current_balance,notes,created_at,family_id,user_id"
            )
            .match(
              isFamilyView
                ? { family_id: familyCtx!.familyId }
                : { user_id: userId }
            ),
        ]);

        if (assetsRes.error) {
          console.warn("Error cargando activos", assetsRes.error);
        } else {
          setAssets((assetsRes.data ?? []) as Asset[]);
        }

        if (debtsRes.error) {
          console.warn("Error cargando deudas", debtsRes.error);
        } else {
          setDebts((debtsRes.data ?? []) as Debt[]);
        }
      } catch (err) {
        console.error("Error cargando patrimonio (familia):", err);
        setPatrimonioError(
          "No se pudo cargar el patrimonio. Intenta de nuevo más tarde."
        );
      } finally {
        setLoadingPatrimonio(false);
      }
    }

    loadPatrimonio();
  }, [user, familyCtx, isFamilyOwner, viewScope]);

  // =========================================================
  //  4. Cálculos agregados
  // =========================================================
  const totalActivos = useMemo(
    () => assets.reduce((sum, a) => sum + (a.current_value ?? 0), 0),
    [assets]
  );

  const totalDeudas = useMemo(
    () =>
      debts.reduce(
        (sum, d) =>
          sum + Number(d.current_balance ?? d.total_amount ?? 0),
        0
      ),
    [debts]
  );

  const patrimonioNeto = totalActivos - totalDeudas;

  // =========================================================
  //  5. Handlers formularios
  // =========================================================
  const handleChangeAssetForm = (
    field: keyof AssetForm,
    value: string
  ) => {
    setAssetForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleChangeDebtForm = (field: keyof DebtForm, value: string) => {
    setDebtForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmitAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert("Tu sesión expiró. Vuelve a iniciar sesión.");
      return;
    }

    const val = Number(assetForm.current_value.replace(",", ""));
    if (!assetForm.name.trim() || !Number.isFinite(val)) {
      alert("Revisa el nombre y el valor del activo.");
      return;
    }

    try {
      setSavingAsset(true);

      const { data, error } = await supabase
        .from("assets")
        .insert([
          {
            user_id: user.id,
            family_id: familyCtx?.familyId ?? null,
            name: assetForm.name.trim(),
            category: assetForm.category || null,
            current_value: val,
            owner: assetForm.owner.trim() || null,
            notes: assetForm.notes.trim() || null,
          },
        ])
        .select(
          "id,user_id,family_id,name,category,current_value,owner,notes,created_at"
        )
        .single();

      if (error) throw error;

      // Si estamos en vista personal o el activo pertenece a uno de los ids que se muestran, lo agregamos
      if (
        effectiveScope === "personal" ||
        !familyCtx ||
        !isFamilyOwner ||
        familyCtx.activeMemberUserIds.includes(data.user_id) ||
        data.user_id === familyCtx.ownerUserId
      ) {
        setAssets((prev) => [data as Asset, ...prev]);
      }

      setAssetForm({
        name: "",
        category: assetForm.category,
        current_value: "",
        owner: "",
        notes: "",
      });
    } catch (err) {
      console.error("Error guardando activo:", err);
      alert("No se pudo guardar el activo. Intenta de nuevo.");
    } finally {
      setSavingAsset(false);
    }
  };

  const handleSubmitDebt = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      alert("Tu sesión expiró. Vuelve a iniciar sesión.");
      return;
    }

    try {
      setSavingDebt(true);

      const total = Number(debtForm.total_amount) || 0;

      const currentBalance =
        debtForm.current_balance && debtForm.current_balance !== ""
          ? Number(debtForm.current_balance)
          : total;

      const { data, error } = await supabase
        .from("debts")
        .insert([
          {
            user_id: user.id,
            family_id: familyCtx?.familyId ?? null,
            name: debtForm.name.trim(),
            type: debtForm.type || "OTRO",
            total_amount: total,
            current_balance: currentBalance,
            notes: debtForm.notes.trim() || null,
          },
        ])
        .select(
          "id,user_id,family_id,name,type,total_amount,current_balance,notes,created_at"
        )
        .single();

      if (error) throw error;

      if (
        effectiveScope === "personal" ||
        !familyCtx ||
        !isFamilyOwner ||
        familyCtx.activeMemberUserIds.includes(data.user_id)
      ) {
        setDebts((prev) => [data as Debt, ...prev]);
      }

      setDebtForm({
        name: "",
        type: "OTRO",
        total_amount: "",
        current_balance: "",
        notes: "",
      });
    } catch (err) {
      console.error("Error guardando deuda:", err);
      alert("No se pudo guardar la deuda.");
    } finally {
      setSavingDebt(false);
    }
  };

  const handleDeleteAsset = async (id: string) => {
    if (!window.confirm("¿Seguro que quieres eliminar este activo?")) return;
    try {
      const { error } = await supabase.from("assets").delete().eq("id", id);
      if (error) throw error;
      setAssets((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error("Error eliminando activo:", err);
      alert("No se pudo eliminar el activo.");
    }
  };

  const handleDeleteDebt = async (id: string) => {
    if (!window.confirm("¿Seguro que quieres eliminar esta deuda?")) return;
    try {
      const { error } = await supabase.from("debts").delete().eq("id", id);
      if (error) throw error;
      setDebts((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      console.error("Error eliminando deuda:", err);
      alert("No se pudo eliminar la deuda.");
    }
  };

  // =========================================================
  //  6. RENDERS ESPECIALES (auth)
  // =========================================================
  if (authLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-sm text-slate-600 dark:text-slate-300">
        Cargando sesión...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-sm text-slate-600 dark:text-slate-300">
        Necesitas iniciar sesión para ver y editar tu patrimonio.
        {authError && (
          <p className="mt-2 text-xs text-rose-500">{authError}</p>
        )}
      </div>
    );
  }

  // =========================================================
  //  7. RENDER PRINCIPAL
  // =========================================================
  return (
    <main className="flex flex-1 flex-col gap-4">
      <AppHeader
        title="Patrimonio (activos y deudas)"
        subtitle="Foto completa de lo que tienes y lo que debes. Desde aquí alimentas tu valor patrimonial."
        activeTab="patrimonio"
        userEmail={user.email}
        onSignOut={handleSignOut}
      />

      {/* Resumen + contexto familiar */}
      <section className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Resumen de patrimonio
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Aquí ves tus activos, deudas y patrimonio neto. Si eres jefe de
                familia, puedes cambiar la vista a patrimonio familiar.
              </p>

              {familyCtx && (
                <div className="mt-2 space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                  <div>
                    Familia:{" "}
                    <span className="font-semibold">
                      {familyCtx.familyName}
                    </span>{" "}
                    {isFamilyOwner
                      ? "(jefe de familia)"
                      : "(miembro de familia)"}
                  </div>
                  <div>
                    Miembros activos:{" "}
                    <span className="font-semibold">
                      {familyCtx.activeMembers}
                    </span>
                  </div>
                </div>
              )}

              {familyError && (
                <p className="mt-1 text-[11px] text-rose-500">
                  {familyError}
                </p>
              )}
            </div>

            {/* Toggle de vista SOLO si es jefe de familia */}
            {familyCtx && isFamilyOwner ? (
              <div className="flex flex-col items-start gap-2 text-xs md:items-end">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Vista de patrimonio
                </div>
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1 text-[11px] dark:border-slate-700 dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => setViewScope("personal")}
                    className={`rounded-full px-3 py-1 ${
                      effectiveScope === "personal"
                        ? "bg-sky-500 text-white"
                        : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    Sólo mi patrimonio
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewScope("family")}
                    className={`rounded-full px-3 py-1 ${
                      effectiveScope === "family"
                        ? "bg-sky-500 text-white"
                        : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    Patrimonio familiar
                  </button>
                </div>
                <p className="max-w-xs text-[11px] text-slate-500 dark:text-slate-400">
                  En modo familiar se suman tus activos y deudas más las de tus
                  familiares activos en la app.
                </p>
              </div>
            ) : (
              <div className="text-right text-[11px] text-slate-500 dark:text-slate-400">
                Vista actual:{" "}
                <span className="font-semibold">Sólo tu patrimonio.</span>
                {familyCtx && !isFamilyOwner && (
                  <>
                    {" "}
                    El modo familiar sólo está disponible para el jefe de
                    familia.
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tarjetas resumen */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex min-h-[110px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Activos totales
            </div>
            <div className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-400">
              {formatMoney(totalActivos)}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Todo lo que tienes a valor aproximado actual.
            </p>
          </div>

          <div className="flex min-h-[110px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Deudas totales
            </div>
            <div className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight text-rose-600 dark:text-rose-400">
              {formatMoney(totalDeudas)}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Saldo pendiente considerando tarjetas, créditos y préstamos.
            </p>
          </div>

          <div className="flex min-h-[110px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Patrimonio neto estimado
            </div>
            <div
              className={`mt-1 text-2xl md:text-3xl font-semibold tracking-tight ${
                patrimonioNeto >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {formatMoney(patrimonioNeto)}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Activos – Deudas. Este es el número clave que vas a querer ver
              subir con el tiempo.
            </p>
          </div>
        </div>
      </section>

      {/* Formularios de captura */}
      <section className="grid gap-4 md:grid-cols-2">
        {/* Form Activos */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            Agregar activo
          </h2>
          <p className="mb-3 text-[11px] text-slate-500 dark:text-slate-400">
            Usa esto para cuentas bancarias, inversiones, propiedades, autos,
            negocios, etc.
          </p>
          <form onSubmit={handleSubmitAsset} className="space-y-3 text-xs">
            <div>
              <label className="mb-1 block text-[11px] text-slate-600 dark:text-slate-300">
                Nombre del activo
              </label>
              <input
                type="text"
                value={assetForm.name}
                onChange={(e) =>
                  handleChangeAssetForm("name", e.target.value)
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                placeholder="Ej. Cuenta BBVA, Casa Monterrey, Tesla, etc."
                required
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] text-slate-600 dark:text-slate-300">
                  Categoría
                </label>
                <select
                  value={assetForm.category}
                  onChange={(e) =>
                    handleChangeAssetForm("category", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                >
                  {ASSET_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[11px] text-slate-600 dark:text-slate-300">
                  Valor aproximado actual
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={assetForm.current_value}
                  onChange={(e) =>
                    handleChangeAssetForm("current_value", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                  placeholder="Ej. 250000"
                  required
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] text-slate-600 dark:text-slate-300">
                ¿A nombre de quién está?
              </label>
              <input
                type="text"
                value={assetForm.owner}
                onChange={(e) =>
                  handleChangeAssetForm("owner", e.target.value)
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                placeholder="Ej. David, Dibri, Hijo, etc."
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] text-slate-600 dark:text-slate-300">
                Notas (opcional)
              </label>
              <textarea
                value={assetForm.notes}
                onChange={(e) =>
                  handleChangeAssetForm("notes", e.target.value)
                }
                className="h-16 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                placeholder="Ej. Esta cuenta es para emergencias, esta casa aún tiene hipoteca, etc."
              />
            </div>

            <button
              type="submit"
              disabled={savingAsset}
              className="w-full rounded-lg bg-emerald-500 py-2 text-xs font-medium text-white transition hover:bg-emerald-600 disabled:opacity-60"
            >
              {savingAsset ? "Guardando..." : "Guardar activo"}
            </button>
          </form>
        </div>

        {/* Form Deudas */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            Agregar deuda
          </h2>
          <p className="mb-3 text-[11px] text-slate-500 dark:text-slate-400">
            Registra tarjetas de crédito, préstamos, créditos de auto, casa,
            etc. Lo importante es el saldo actual.
          </p>

          <form onSubmit={handleSubmitDebt} className="space-y-3 text-xs">
            <div>
              <label className="mb-1 block text-[11px] text-slate-600 dark:text-slate-300">
                Nombre de la deuda
              </label>
              <input
                type="text"
                value={debtForm.name}
                onChange={(e) =>
                  handleChangeDebtForm("name", e.target.value)
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                placeholder="Ej. Tarjeta BBVA Azul, Crédito casa, etc."
                required
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] text-slate-600 dark:text-slate-300">
                  Tipo de deuda
                </label>
                <select
                  value={debtForm.type}
                  onChange={(e) =>
                    handleChangeDebtForm("type", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                >
                  {DEBT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[11px] text-slate-600 dark:text-slate-300">
                  Monto total autorizado o original
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={debtForm.total_amount}
                  onChange={(e) =>
                    handleChangeDebtForm("total_amount", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                  placeholder="Ej. 100000"
                  required
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] text-slate-600 dark:text-slate-300">
                Saldo actual aproximado
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={debtForm.current_balance}
                onChange={(e) =>
                  handleChangeDebtForm("current_balance", e.target.value)
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                placeholder="Ej. 45000"
              />
              <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                Si lo dejas vacío, se tomará el monto total como saldo.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-[11px] text-slate-600 dark:text-slate-300">
                Notas (opcional)
              </label>
              <textarea
                value={debtForm.notes}
                onChange={(e) =>
                  handleChangeDebtForm("notes", e.target.value)
                }
                className="h-16 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                placeholder="Ej. Esta tarjeta se paga el 5 de cada mes, crédito a 15 años, etc."
              />
            </div>

            <button
              type="submit"
              disabled={savingDebt}
              className="w-full rounded-lg bg-rose-500 py-2 text-xs font-medium text-white transition hover:bg-rose-600 disabled:opacity-60"
            >
              {savingDebt ? "Guardando..." : "Guardar deuda"}
            </button>
          </form>
        </div>
      </section>

      {/* Listados */}
      <section className="grid gap-4 md:grid-cols-2">
        {/* Lista activos */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Lista de activos
            </h2>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {assets.length} registro(s)
            </span>
          </div>

          {loadingPatrimonio ? (
            <p className="text-xs text-slate-500">Cargando activos...</p>
          ) : assets.length === 0 ? (
            <p className="text-xs text-slate-500">
              Aún no has registrado activos en esta vista.
            </p>
          ) : (
            <ul className="space-y-2 text-xs">
              {assets.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/40"
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-slate-800 dark:text-slate-100">
                      {a.name}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {a.category || "Sin categoría"} ·{" "}
                      {a.owner ? `A nombre de: ${a.owner}` : "Propietario: N/D"}
                    </span>
                    {a.created_at && (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        Registrado: {formatDateDisplay(a.created_at)}
                      </span>
                    )}
                    {a.notes && (
                      <span className="mt-1 text-[11px] text-slate-500 dark:text-slate-300">
                        {a.notes}
                      </span>
                    )}
                  </div>
                  <div className="ml-3 flex flex-col items-end gap-2">
                    <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatMoney(a.current_value ?? 0)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteAsset(a.id)}
                      className="text-[10px] text-rose-500 hover:underline"
                    >
                      Eliminar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Lista deudas */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Lista de deudas
            </h2>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {debts.length} registro(s)
            </span>
          </div>

          {loadingPatrimonio ? (
            <p className="text-xs text-slate-500">Cargando deudas...</p>
          ) : debts.length === 0 ? (
            <p className="text-xs text-slate-500">
              Aún no has registrado deudas en esta vista.
            </p>
          ) : (
            <ul className="space-y-2 text-xs">
              {debts.map((d) => (
                <li
                  key={d.id}
                  className="flex items-start justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/40"
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-slate-800 dark:text-slate-100">
                      {d.name}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {d.type || "Sin tipo"} · Total:{" "}
                      {formatMoney(d.total_amount ?? 0)}
                    </span>
                    {d.created_at && (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        Registrada: {formatDateDisplay(d.created_at)}
                      </span>
                    )}
                    {d.notes && (
                      <span className="mt-1 text-[11px] text-slate-500 dark:text-slate-300">
                        {d.notes}
                      </span>
                    )}
                  </div>
                  <div className="ml-3 flex flex-col items-end gap-2">
                    <span className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                      {formatMoney(
                        Number(d.current_balance ?? d.total_amount ?? 0)
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteDebt(d.id)}
                      className="text-[10px] text-rose-500 hover:underline"
                    >
                      Eliminar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {patrimonioError && (
        <section className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
          {patrimonioError}
        </section>
      )}
    </main>
  );
}
