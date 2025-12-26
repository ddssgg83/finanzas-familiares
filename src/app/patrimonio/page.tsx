"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { AppHeader } from "@/components/AppHeader";
import { PageShell } from "@/components/ui/PageShell";

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
  membersByUserId?: Record<
    string,
    { userId: string; fullName: string; shortLabel: string }
  >;
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
//  UI helpers (Minimal Premium)
// =========================================================

const UI = {
  card:
    "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900",
  cardTight:
    "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900",
  title: "text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100",
  sub: "text-xs text-slate-500 dark:text-slate-400",
  label: "mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-300",
  helper: "mt-1 text-[10px] text-slate-500 dark:text-slate-400",
  field:
    "h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm leading-normal text-slate-900 outline-none transition " +
    "focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-500/20 " +
    "dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100",
  textarea:
    "min-h-[96px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-normal text-slate-900 outline-none transition " +
    "focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-500/20 " +
    "dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100",
  btnPrimary:
    "h-10 w-full rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-black disabled:opacity-60 " +
    "dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white",
  btnSecondary:
    "h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 " +
    "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
  btnChip:
    "rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 " +
    "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
  btnLink: "text-[11px] font-medium text-sky-600 hover:underline dark:text-sky-400",
  btnDanger: "text-[11px] font-medium text-rose-600 hover:underline dark:text-rose-400",
  pill:
    "inline-flex rounded-full border border-slate-200 bg-slate-50 p-1 text-[11px] dark:border-slate-700 dark:bg-slate-900",
  pillOn:
    "rounded-full bg-slate-900 px-3 py-1 text-white dark:bg-slate-200 dark:text-slate-900",
  pillOff: "rounded-full px-3 py-1 text-slate-700 dark:text-slate-200",
  listItem:
    "flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 " +
    "dark:border-slate-800 dark:bg-slate-900",
};

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
    category: ASSET_CATEGORIES[0],
    current_value: "",
    owner: "",
    notes: "",
  });

  const [debtForm, setDebtForm] = useState<DebtForm>({
    name: "",
    type: DEBT_TYPES[0],
    total_amount: "",
    current_balance: "",
    notes: "",
  });

  const [savingAsset, setSavingAsset] = useState(false);
  const [savingDebt, setSavingDebt] = useState(false);

  // Edición
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editingDebtId, setEditingDebtId] = useState<string | null>(null);

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
          if (!ignore) setAuthError("Hubo un problema al cargar tu sesión.");
        }
        if (!ignore) setUser(data?.user ?? null);
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
  //  2. FAMILY CONTEXT
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

        const { data: fam, error: famError } = await supabase
          .from("families")
          .select("id,name,user_id")
          .eq("id", member.family_id)
          .single();

        if (famError) throw famError;

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
        console.error("Error cargando patrimonio:", err);
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
        (sum, d) => sum + Number(d.current_balance ?? d.total_amount ?? 0),
        0
      ),
    [debts]
  );

  const patrimonioNeto = totalActivos - totalDeudas;

  // =========================================================
  //  5. Handlers formularios
  // =========================================================
  const handleChangeAssetForm = (field: keyof AssetForm, value: string) => {
    setAssetForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleChangeDebtForm = (field: keyof DebtForm, value: string) => {
    setDebtForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetAssetForm = () => {
    setAssetForm({
      name: "",
      category: ASSET_CATEGORIES[0],
      current_value: "",
      owner: "",
      notes: "",
    });
    setEditingAssetId(null);
  };

  const resetDebtForm = () => {
    setDebtForm({
      name: "",
      type: DEBT_TYPES[0],
      total_amount: "",
      current_balance: "",
      notes: "",
    });
    setEditingDebtId(null);
  };

  const handleSubmitAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert("Tu sesión expiró. Vuelve a iniciar sesión.");
      return;
    }

    const rawValue = assetForm.current_value.replace(/\s/g, "").replace(",", "");
    const val = Number(rawValue);

    if (!assetForm.name.trim() || !Number.isFinite(val) || val < 0) {
      alert("Revisa el nombre y el valor del activo.");
      return;
    }

    try {
      setSavingAsset(true);

      if (editingAssetId) {
        const { data, error } = await supabase
          .from("assets")
          .update({
            name: assetForm.name.trim(),
            category: assetForm.category || null,
            current_value: val,
            owner: assetForm.owner.trim() || null,
            notes: assetForm.notes.trim() || null,
          })
          .eq("id", editingAssetId)
          .select(
            "id,user_id,family_id,name,category,current_value,owner,notes,created_at"
          )
          .single();

        if (error) throw error;

        setAssets((prev) =>
          prev.map((a) => (a.id === editingAssetId ? (data as Asset) : a))
        );
        resetAssetForm();
      } else {
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

        if (
          effectiveScope === "personal" ||
          !familyCtx ||
          !isFamilyOwner ||
          familyCtx.activeMemberUserIds.includes(data.user_id) ||
          data.user_id === familyCtx.ownerUserId
        ) {
          setAssets((prev) => [data as Asset, ...prev]);
        }

        resetAssetForm();
      }
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

    const rawTotal = debtForm.total_amount.replace(/\s/g, "").replace(",", "");
    const total = Number(rawTotal);

    if (!debtForm.name.trim() || !Number.isFinite(total) || total < 0) {
      alert("Revisa el nombre y el monto total de la deuda.");
      return;
    }

    const rawCurrent = debtForm.current_balance
      ? debtForm.current_balance.replace(/\s/g, "").replace(",", "")
      : "";
    const currentBalance =
      rawCurrent && rawCurrent !== "" ? Number(rawCurrent) : total;

    if (!Number.isFinite(currentBalance) || currentBalance < 0) {
      alert("Revisa el saldo actual de la deuda.");
      return;
    }

    const debtType = DEBT_TYPES.includes(debtForm.type)
      ? debtForm.type
      : "Otro";

    try {
      setSavingDebt(true);

      if (editingDebtId) {
        const { data, error } = await supabase
          .from("debts")
          .update({
            name: debtForm.name.trim(),
            type: debtType,
            total_amount: total,
            current_balance: currentBalance,
            notes: debtForm.notes.trim() || null,
          })
          .eq("id", editingDebtId)
          .select(
            "id,user_id,family_id,name,type,total_amount,current_balance,notes,created_at"
          )
          .single();

        if (error) throw error;

        setDebts((prev) =>
          prev.map((d) => (d.id === editingDebtId ? (data as Debt) : d))
        );
        resetDebtForm();
      } else {
        const { data, error } = await supabase
          .from("debts")
          .insert([
            {
              user_id: user.id,
              family_id: familyCtx?.familyId ?? null,
              name: debtForm.name.trim(),
              type: debtType,
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
          familyCtx.activeMemberUserIds.includes(data.user_id) ||
          data.user_id === familyCtx.ownerUserId
        ) {
          setDebts((prev) => [data as Debt, ...prev]);
        }

        resetDebtForm();
      }
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
      if (editingAssetId === id) resetAssetForm();
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
      if (editingDebtId === id) resetDebtForm();
    } catch (err) {
      console.error("Error eliminando deuda:", err);
      alert("No se pudo eliminar la deuda.");
    }
  };

  const startEditAsset = (asset: Asset) => {
    setEditingAssetId(asset.id);
    setAssetForm({
      name: asset.name ?? "",
      category: asset.category || ASSET_CATEGORIES[0],
      current_value: asset.current_value?.toString() ?? "",
      owner: asset.owner ?? "",
      notes: asset.notes ?? "",
    });
  };

  const startEditDebt = (debt: Debt) => {
    setEditingDebtId(debt.id);
    setDebtForm({
      name: debt.name ?? "",
      type: DEBT_TYPES.includes(debt.type) ? debt.type : DEBT_TYPES[0],
      total_amount: debt.total_amount?.toString() ?? "",
      current_balance:
        debt.current_balance != null ? debt.current_balance.toString() : "",
      notes: debt.notes ?? "",
    });
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
        {authError && <p className="mt-2 text-xs text-rose-500">{authError}</p>}
      </div>
    );
  }

  // =========================================================
  //  7. RENDER PRINCIPAL
  // =========================================================
  return (
    <PageShell>
      <AppHeader
        title="Patrimonio (activos y deudas)"
        subtitle="Foto completa de lo que tienes y lo que debes. Desde aquí alimentas tu valor patrimonial."
        activeTab="patrimonio"
        userEmail={user.email}
        onSignOut={handleSignOut}
      />

      {/* Resumen + contexto familiar */}
      <section className="space-y-4">
        <div className={UI.card}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <h2 className={UI.title}>Resumen</h2>
              <p className={UI.sub}>
                Aquí ves tus activos, deudas y patrimonio neto. Si eres jefe de familia,
                puedes cambiar la vista a patrimonio familiar.
              </p>

              {familyCtx && (
                <div className="mt-2 space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                  <div>
                    Familia:{" "}
                    <span className="font-semibold">{familyCtx.familyName}</span>{" "}
                    {isFamilyOwner ? "(jefe de familia)" : "(miembro)"}
                  </div>
                  <div>
                    Miembros activos:{" "}
                    <span className="font-semibold">{familyCtx.activeMembers}</span>
                  </div>
                  {familyLoading && (
                    <div className="text-[10px] text-slate-400">
                      Actualizando información de familia...
                    </div>
                  )}
                </div>
              )}

              {familyError && (
                <p className="mt-1 text-[11px] text-rose-500">{familyError}</p>
              )}
            </div>

            {/* Toggle de vista SOLO si es jefe de familia */}
            {familyCtx && isFamilyOwner ? (
              <div className="flex flex-col items-start gap-2 text-xs md:items-end">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Vista
                </div>

                <div className={UI.pill}>
                  <button
                    type="button"
                    onClick={() => setViewScope("personal")}
                    className={
                      effectiveScope === "personal" ? UI.pillOn : UI.pillOff
                    }
                  >
                    Sólo yo
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewScope("family")}
                    className={effectiveScope === "family" ? UI.pillOn : UI.pillOff}
                  >
                    Familiar
                  </button>
                </div>

                <p className="max-w-xs text-[11px] text-slate-500 dark:text-slate-400">
                  En modo familiar se suman tus activos y deudas más las de tus familiares
                  activos en la app.
                </p>
              </div>
            ) : (
              <div className="text-right text-[11px] text-slate-500 dark:text-slate-400">
                Vista actual: <span className="font-semibold">Sólo tu patrimonio.</span>
                {familyCtx && !isFamilyOwner && (
                  <> El modo familiar sólo está disponible para el jefe de familia.</>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tarjetas resumen (premium minimal: negro + color sólo en números) */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className={UI.cardTight}>
            <div className="text-xs text-slate-500 dark:text-slate-400">Activos</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-400">
              {formatMoney(totalActivos)}
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Todo lo que tienes a valor aproximado actual.
            </p>
          </div>

          <div className={UI.cardTight}>
            <div className="text-xs text-slate-500 dark:text-slate-400">Deudas</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight text-rose-600 dark:text-rose-400">
              {formatMoney(totalDeudas)}
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Saldo pendiente considerando tarjetas, créditos y préstamos.
            </p>
          </div>

          <div className={UI.cardTight}>
            <div className="text-xs text-slate-500 dark:text-slate-400">Neto</div>
            <div
              className={`mt-1 text-2xl font-semibold tracking-tight ${
                patrimonioNeto >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {formatMoney(patrimonioNeto)}
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Activos – Deudas. Número clave para ver crecer.
            </p>
          </div>
        </div>
      </section>

      {/* Formularios */}
      <section className="grid gap-4 md:grid-cols-2">
        {/* Activos */}
        <div className={UI.card}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className={UI.title}>
              {editingAssetId ? "Editar activo" : "Agregar activo"}
            </h2>

            {editingAssetId && (
              <button type="button" onClick={resetAssetForm} className={UI.btnLink}>
                Cancelar
              </button>
            )}
          </div>

          <p className={UI.sub}>
            Cuentas bancarias, inversiones, propiedades, autos, negocios, etc.
          </p>

          <form onSubmit={handleSubmitAsset} className="mt-4 space-y-3">
            <div>
              <label className={UI.label}>Nombre</label>
              <input
                type="text"
                value={assetForm.name}
                onChange={(e) => handleChangeAssetForm("name", e.target.value)}
                className={UI.field}
                placeholder="Ej. Cuenta BBVA, Casa Monterrey, Tesla…"
                required
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className={UI.label}>Categoría</label>
                <select
                  value={assetForm.category}
                  onChange={(e) => handleChangeAssetForm("category", e.target.value)}
                  className={UI.field}
                >
                  {ASSET_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={UI.label}>Valor aproximado</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={assetForm.current_value}
                  onChange={(e) =>
                    handleChangeAssetForm("current_value", e.target.value)
                  }
                  className={UI.field}
                  placeholder="Ej. 250000"
                  required
                />
              </div>
            </div>

            <div>
              <label className={UI.label}>A nombre de</label>
              <input
                type="text"
                value={assetForm.owner}
                onChange={(e) => handleChangeAssetForm("owner", e.target.value)}
                className={UI.field}
                placeholder="Ej. David, Dibri, Empresa…"
              />
            </div>

            <div>
              <label className={UI.label}>Notas (opcional)</label>
              <textarea
                value={assetForm.notes}
                onChange={(e) => handleChangeAssetForm("notes", e.target.value)}
                className={UI.textarea}
                placeholder="Ej. Emergencias, valuación aproximada, etc."
              />
            </div>

            <button type="submit" disabled={savingAsset} className={UI.btnPrimary}>
              {savingAsset
                ? editingAssetId
                  ? "Actualizando..."
                  : "Guardando..."
                : editingAssetId
                ? "Guardar cambios"
                : "Guardar activo"}
            </button>
          </form>
        </div>

        {/* Deudas */}
        <div className={UI.card}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className={UI.title}>
              {editingDebtId ? "Editar deuda" : "Agregar deuda"}
            </h2>

            {editingDebtId && (
              <button type="button" onClick={resetDebtForm} className={UI.btnLink}>
                Cancelar
              </button>
            )}
          </div>

          <p className={UI.sub}>
            Tarjetas, préstamos, créditos de auto/casa. Lo importante es el saldo actual.
          </p>

          <form onSubmit={handleSubmitDebt} className="mt-4 space-y-3">
            <div>
              <label className={UI.label}>Nombre</label>
              <input
                type="text"
                value={debtForm.name}
                onChange={(e) => handleChangeDebtForm("name", e.target.value)}
                className={UI.field}
                placeholder="Ej. Tarjeta BBVA Azul, Crédito casa…"
                required
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className={UI.label}>Tipo</label>
                <select
                  value={debtForm.type}
                  onChange={(e) => handleChangeDebtForm("type", e.target.value)}
                  className={UI.field}
                >
                  {DEBT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={UI.label}>Monto total</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={debtForm.total_amount}
                  onChange={(e) =>
                    handleChangeDebtForm("total_amount", e.target.value)
                  }
                  className={UI.field}
                  placeholder="Ej. 100000"
                  required
                />
              </div>
            </div>

            <div>
              <label className={UI.label}>Saldo actual (opcional)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={debtForm.current_balance}
                onChange={(e) =>
                  handleChangeDebtForm("current_balance", e.target.value)
                }
                className={UI.field}
                placeholder="Ej. 45000"
              />
              <div className={UI.helper}>
                Si lo dejas vacío, se tomará el monto total como saldo.
              </div>
            </div>

            <div>
              <label className={UI.label}>Notas (opcional)</label>
              <textarea
                value={debtForm.notes}
                onChange={(e) => handleChangeDebtForm("notes", e.target.value)}
                className={UI.textarea}
                placeholder="Ej. Se paga el 5 de cada mes, tasa, plazo, etc."
              />
            </div>

            <button type="submit" disabled={savingDebt} className={UI.btnPrimary}>
              {savingDebt
                ? editingDebtId
                  ? "Actualizando..."
                  : "Guardando..."
                : editingDebtId
                ? "Guardar cambios"
                : "Guardar deuda"}
            </button>
          </form>
        </div>
      </section>

      {/* Listados */}
      <section className="grid gap-4 md:grid-cols-2">
        {/* Activos */}
        <div className={UI.card}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className={UI.title}>Activos</h2>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {assets.length} activos
            </span>
          </div>

          {loadingPatrimonio ? (
            <p className="text-xs text-slate-500">Cargando activos...</p>
          ) : assets.length === 0 ? (
            <p className="text-xs text-slate-500">
              Aún no has registrado activos en esta vista.
            </p>
          ) : (
            <ul className="space-y-2">
              {assets.map((a) => (
                <li key={a.id} className={UI.listItem}>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {a.name}
                    </div>

                    <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {(a.category || "Sin categoría") + " · "}
                      {a.owner ? `A nombre de: ${a.owner}` : "Propietario: N/D"}
                    </div>

                    {(a.created_at || effectiveScope === "family" || a.notes) && (
                      <div className="mt-1 space-y-1">
                        {a.created_at && (
                          <div className="text-[10px] text-slate-400 dark:text-slate-500">
                            {formatDateDisplay(a.created_at)}
                          </div>
                        )}

                        {effectiveScope === "family" && (
                          <div className="text-[10px] text-slate-400 dark:text-slate-500">
                            Registrado por:{" "}
                            {a.user_id === user.id ? "Tú" : "Otro miembro"}
                          </div>
                        )}

                        {a.notes && (
                          <div className="text-[11px] text-slate-600 dark:text-slate-300">
                            {a.notes}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatMoney(a.current_value ?? 0)}
                    </div>

                    {a.user_id === user.id && (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => startEditAsset(a)}
                          className={UI.btnLink}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAsset(a.id)}
                          className={UI.btnDanger}
                        >
                          Eliminar
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Deudas */}
        <div className={UI.card}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className={UI.title}>Deudas</h2>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {debts.length} deudas
            </span>
          </div>

          {loadingPatrimonio ? (
            <p className="text-xs text-slate-500">Cargando deudas...</p>
          ) : debts.length === 0 ? (
            <p className="text-xs text-slate-500">
              Aún no has registrado deudas en esta vista.
            </p>
          ) : (
            <ul className="space-y-2">
              {debts.map((d) => (
                <li key={d.id} className={UI.listItem}>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {d.name}
                    </div>

                    <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {(d.type || "Sin tipo") + " · Total: "}
                      {formatMoney(d.total_amount ?? 0)}
                    </div>

                    {(d.created_at || effectiveScope === "family" || d.notes) && (
                      <div className="mt-1 space-y-1">
                        {d.created_at && (
                          <div className="text-[10px] text-slate-400 dark:text-slate-500">
                            {formatDateDisplay(d.created_at)}
                          </div>
                        )}

                        {effectiveScope === "family" && (
                          <div className="text-[10px] text-slate-400 dark:text-slate-500">
                            Registrada por:{" "}
                            {d.user_id === user.id ? "Tú" : "Otro miembro"}
                          </div>
                        )}

                        {d.notes && (
                          <div className="text-[11px] text-slate-600 dark:text-slate-300">
                            {d.notes}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <div className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                      {formatMoney(Number(d.current_balance ?? d.total_amount ?? 0))}
                    </div>

                    {d.user_id === user.id && (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => startEditDebt(d)}
                          className={UI.btnLink}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDebt(d.id)}
                          className={UI.btnDanger}
                        >
                          Eliminar
                        </button>
                      </div>
                    )}
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
    </PageShell>
  );
}
