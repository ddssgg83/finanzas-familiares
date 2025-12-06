"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { AppHeader } from "@/components/AppHeader";

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

// ---- Familia (para modo familiar) ----
type Family = {
  id: string;
  name: string;
  user_id: string; // jefe de familia
  created_at: string;
};

type FamilyMember = {
  id: string;
  family_id: string;
  user_id: string | null;
  invited_email: string;
  role: "owner" | "member";
  status: "active" | "pending" | "left";
  created_at: string;
};

type ViewMode = "personal" | "family";

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

const BASE_OWNER_OPTIONS = ["Yo", "Esposa", "Hijo / Hija", "Otro"];

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
  // -------- AUTH --------
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // -------- MODO VISTA (Personal / Familia) --------
  const [viewMode, setViewMode] = useState<ViewMode>("personal");

  // -------- INFO FAMILIA --------
  const [family, setFamily] = useState<Family | null>(null);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [familyLoading, setFamilyLoading] = useState(false);
  const [familyError, setFamilyError] = useState<string | null>(null);

  // -------- DATA --------
  const [assets, setAssets] = useState<Asset[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingAsset, setSavingAsset] = useState(false);
  const [savingDebt, setSavingDebt] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Formularios
  const [assetForm, setAssetForm] = useState<AssetForm>({
    name: "",
    category: "",
    currentValue: "",
    owner: "Yo",
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
    owner: "Yo",
    currentBalance: "",
    notes: "",
  });

  // Filtros
  const [ownerFilter, setOwnerFilter] = useState<string>("TODOS");
  const [searchText, setSearchText] = useState<string>("");

  // Edición
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editingDebtId, setEditingDebtId] = useState<string | null>(null);

  // -------- AUTH EFFECT --------
  useEffect(() => {
    let ignore = false;

    async function loadUser() {
      setAuthLoading(true);
      setAuthError(null);
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error && (error as any).name !== "AuthSessionMissingError") {
          console.error("Error obteniendo usuario actual", error);
          setAuthError("Hubo un problema al cargar tu sesión.");
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
      setFamily(null);
      setFamilyMembers([]);
    } catch (err) {
      console.error("Error cerrando sesión", err);
    }
  };

  // -------- Cargar info de familia (si existe) --------
  useEffect(() => {
    const currentUser = user;
    if (!currentUser) {
      setFamily(null);
      setFamilyMembers([]);
      setFamilyError(null);
      setFamilyLoading(false);
      return;
    }

    const userId = currentUser.id;
    const email = (currentUser.email ?? "").toLowerCase();
    let cancelled = false;

    async function loadFamilyInfo() {
      setFamilyLoading(true);
      setFamilyError(null);

      try {
        // 1) Buscar si pertenece a una familia como miembro activo
        const { data: memberRows, error: membershipError } = await supabase
          .from("family_members")
          .select(
            "id,family_id,user_id,invited_email,role,status,created_at"
          )
          .or(`user_id.eq.${userId},invited_email.eq.${email}`)
          .eq("status", "active")
          .limit(1);

        if (membershipError) {
          console.error(
            "Error buscando membresía de familia en patrimonio:",
            membershipError
          );
          throw membershipError;
        }

        if (!memberRows || memberRows.length === 0) {
          if (!cancelled) {
            setFamily(null);
            setFamilyMembers([]);
          }
          return;
        }

        const member = memberRows[0];

        // 2) Obtener la familia
        const { data: familyRow, error: familyErrorResp } = await supabase
          .from("families")
          .select("id,name,user_id,created_at")
          .eq("id", member.family_id)
          .single();

        if (familyErrorResp) {
          console.error(
            "Error cargando familia en patrimonio:",
            familyErrorResp
          );
          throw familyErrorResp;
        }

        // 3) Obtener todos los miembros
        const { data: allMembers, error: membersError } = await supabase
          .from("family_members")
          .select(
            "id,family_id,user_id,invited_email,role,status,created_at"
          )
          .eq("family_id", familyRow.id)
          .order("created_at", { ascending: true });

        if (membersError) {
          console.error(
            "Error cargando miembros de familia en patrimonio:",
            membersError
          );
          throw membersError;
        }

        if (!cancelled) {
          setFamily(familyRow as Family);
          setFamilyMembers((allMembers ?? []) as FamilyMember[]);
        }
      } catch (err) {
        console.error("Error cargando info de familia (patrimonio):", err);
        if (!cancelled) {
          setFamily(null);
          setFamilyMembers([]);
          setFamilyError(
            "No se pudo cargar la información de tu familia. Puedes seguir usando tu patrimonio personal."
          );
        }
      } finally {
        if (!cancelled) setFamilyLoading(false);
      }
    }

    loadFamilyInfo();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // ¿Es jefe de familia?
  const isFamilyOwner = !!(
    family &&
    user &&
    family.user_id === user.id
  );

  // Si alguien intenta dejar modo "familia" pero no es owner, lo regresamos a personal
  useEffect(() => {
    if (viewMode === "family" && !isFamilyOwner) {
      setViewMode("personal");
    }
  }, [viewMode, isFamilyOwner]);

  // -------- Cargar activos + deudas (según modo) --------
  useEffect(() => {
    const currentUser = user;
    if (!currentUser) {
      setAssets([]);
      setDebts([]);
      return;
    }

    const userId = currentUser.id;
    let cancelled = false;

    async function loadPatrimonio() {
      setLoading(true);
      setError(null);

      try {
        // Por defecto sólo mis datos
        let userIds: string[] = [userId];

        // Si estamos en modo familia y soy owner, incluimos a todos los miembros con user_id
        if (viewMode === "family" && family && isFamilyOwner) {
          const memberUserIds = familyMembers
            .map((m) => m.user_id)
            .filter((id): id is string => !!id);

          if (memberUserIds.length) {
            userIds = Array.from(new Set([...memberUserIds, userId]));
          }
        }

        const [assetsRes, debtsRes] = await Promise.all([
          supabase
            .from("assets")
            .select(
              "id,name,category,current_value,owner,notes,family_member_id,created_at,user_id"
            )
            .in("user_id", userIds)
            .order("created_at", { ascending: false }),
          supabase
            .from("debts")
            .select(
              "id,name,category,type,total_amount,monthly_payment,interest_rate,due_date,owner,notes,current_balance,family_member_id,created_at,user_id"
            )
            .in("user_id", userIds)
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

        if (!cancelled) {
          setAssets((assetsRes.data ?? []) as Asset[]);
          setDebts((debtsRes.data ?? []) as Debt[]);
        }
      } catch (err) {
        console.error("Error cargando patrimonio", err);
        if (!cancelled) {
          setError("No se pudieron cargar tus activos y deudas.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPatrimonio();

    return () => {
      cancelled = true;
    };
  }, [user, viewMode, family, familyMembers, isFamilyOwner]);

  // -------- Totales generales (sin filtros) --------
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
    () => debts.reduce((sum, d) => sum + Number(d.monthly_payment ?? 0), 0),
    [debts]
  );

  // -------- Opciones de dueño (para filtros y selects) --------
  const ownerOptions = useMemo(() => {
    const set = new Set<string>(BASE_OWNER_OPTIONS);
    for (const a of assets) {
      if (a.owner) set.add(a.owner);
    }
    for (const d of debts) {
      if (d.owner) set.add(d.owner);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es-MX"));
  }, [assets, debts]);

  // -------- Listas filtradas --------
  const filteredAssets = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return assets.filter((a) => {
      if (
        ownerFilter !== "TODOS" &&
        (a.owner ?? "").toLowerCase() !== ownerFilter.toLowerCase()
      ) {
        return false;
      }

      if (!q) return true;

      const haystack = [a.name, a.category ?? "", a.owner ?? "", a.notes ?? ""]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [assets, ownerFilter, searchText]);

  const filteredDebts = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return debts.filter((d) => {
      if (
        ownerFilter !== "TODOS" &&
        (d.owner ?? "").toLowerCase() !== ownerFilter.toLowerCase()
      ) {
        return false;
      }

      if (!q) return true;

      const haystack = [
        d.name,
        d.type ?? "",
        d.category ?? "",
        d.owner ?? "",
        d.notes ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [debts, ownerFilter, searchText]);

  // -------- Totales filtrados --------
  const filteredTotalActivos = useMemo(
    () => filteredAssets.reduce((sum, a) => sum + (a.current_value ?? 0), 0),
    [filteredAssets]
  );

  const filteredTotalDeudas = useMemo(
    () =>
      filteredDebts.reduce(
        (sum, d) => sum + Number(d.current_balance ?? d.total_amount ?? 0),
        0
      ),
    [filteredDebts]
  );

  const filteredPatrimonioNeto = filteredTotalActivos - filteredTotalDeudas;

  const filteredPagoMensual = useMemo(
    () =>
      filteredDebts.reduce(
        (sum, d) => sum + Number(d.monthly_payment ?? 0),
        0
      ),
    [filteredDebts]
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
      owner: "Yo",
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
      owner: "Yo",
      currentBalance: "",
      notes: "",
    });
    setEditingDebtId(null);
  };

  const cancelAssetEdit = () => {
    resetAssetForm();
  };

  const cancelDebtEdit = () => {
    resetDebtForm();
  };

  const handleSaveAsset = async (e: FormEvent<HTMLFormElement>) => {
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

    const payload = {
      name: assetForm.name.trim(),
      category: assetForm.category.trim() || null,
      current_value: valueNumber,
      owner: assetForm.owner.trim() || null,
      notes: assetForm.notes.trim() || null,
      family_member_id: null as string | null,
    };

    try {
      if (editingAssetId) {
        // UPDATE
        const { data, error } = await supabase
          .from("assets")
          .update(payload)
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
            ...payload,
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

  const handleSaveDebt = async (e: FormEvent<HTMLFormElement>) => {
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

    const payload = {
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
      family_member_id: null as string | null,
    };

    try {
      if (editingDebtId) {
        // UPDATE
        const { data, error } = await supabase
          .from("debts")
          .update(payload)
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
            ...payload,
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

  const handleEditAsset = (asset: Asset) => {
    setEditingDebtId(null);
    setEditingAssetId(asset.id);
    setAssetForm({
      name: asset.name ?? "",
      category: asset.category ?? "",
      currentValue:
        typeof asset.current_value === "number"
          ? asset.current_value.toString()
          : "",
      owner: asset.owner ?? "Yo",
      notes: asset.notes ?? "",
    });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleEditDebt = (debt: Debt) => {
    setEditingAssetId(null);
    setEditingDebtId(debt.id);
    setDebtForm({
      name: debt.name ?? "",
      category: debt.category ?? "",
      type: debt.type ?? "",
      totalAmount:
        typeof debt.total_amount === "number"
          ? debt.total_amount.toString()
          : "",
      monthlyPayment:
        typeof debt.monthly_payment === "number"
          ? debt.monthly_payment.toString()
          : "",
      interestRate:
        typeof debt.interest_rate === "number"
          ? debt.interest_rate.toString()
          : "",
      dueDate: debt.due_date ?? "",
      owner: debt.owner ?? "Yo",
      currentBalance:
        typeof debt.current_balance === "number"
          ? debt.current_balance.toString()
          : "",
      notes: debt.notes ?? "",
    });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleExportPdf = () => {
    // Versión simple: usa imprimir del navegador (puedes guardar como PDF)
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const scopeLabel =
    viewMode === "family" && family && isFamilyOwner
      ? `tu familia "${family.name}"`
      : "tus datos personales";

  const familyMembersWithUser = familyMembers.filter((m) => m.user_id);

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
      <div className="flex flex-1 flex-col items-center justify-center text-sm text-slate-600 dark:text-slate-300">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-semibold">Patrimonio familiar</p>
          <p className="text-slate-500 dark:text-slate-400">
            Inicia sesión desde el dashboard para ver y registrar tus activos y
            deudas.
          </p>
          {authError && (
            <p className="text-[11px] text-rose-600 dark:text-rose-400">
              {authError}
            </p>
          )}
        </div>
      </div>
    );
  }

  // -------- UI PATRIMONIO --------
  return (
    <main className="flex flex-1 flex-col gap-4 print:bg-white">
      <AppHeader
        title="Patrimonio familiar"
        subtitle="Aquí llevas el control de tus activos (lo que tienes) y tus deudas (lo que debes)."
        activeTab="patrimonio"
        userEmail={user?.email ?? ""}
        onSignOut={handleSignOut}
      />

      {/* Barra de acciones + modo de vista */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900 print:border-0 print:shadow-none">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Resumen de patrimonio
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Estás viendo {scopeLabel}. Puedes alternar entre tu vista personal y
            la vista familiar (si eres jefe de familia).
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isFamilyOwner && (
            <div className="inline-flex items-center overflow-hidden rounded-full border border-slate-200 bg-slate-50 text-[11px] dark:border-slate-700 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setViewMode("personal")}
                className={`px-3 py-1 ${
                  viewMode === "personal"
                    ? "bg-sky-500 text-white"
                    : "text-slate-700 dark:text-slate-200"
                }`}
              >
                Solo yo
              </button>
              <button
                type="button"
                onClick={() => setViewMode("family")}
                className={`px-3 py-1 ${
                  viewMode === "family"
                    ? "bg-emerald-500 text-white"
                    : "text-slate-700 dark:text-slate-200"
                }`}
              >
                Familia
                {familyMembersWithUser.length > 0
                  ? ` (${familyMembersWithUser.length})`
                  : ""}
              </button>
            </div>
          )}

          {!isFamilyOwner && family && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-200">
              Tienes familia configurada ({family.name}). El patrimonio
              familiar sólo lo puede ver el jefe de familia.
            </span>
          )}

          <button
            type="button"
            onClick={handleExportPdf}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 print:hidden"
          >
            Exportar PDF / Imprimir
          </button>
        </div>
      </section>

      {/* Resumen general */}
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

      <section className="px-1">
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Estas cifras consideran{" "}
          <span className="font-semibold">
            {viewMode === "family" && family && isFamilyOwner
              ? `a todos los miembros vinculados de la familia "${family.name}".`
              : "únicamente tus registros personales."}
          </span>{" "}
          Los filtros de abajo te permiten analizar por dueño, banco,
          categoría, etc.
        </p>
      </section>

      {/* Filtros de patrimonio */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          {/* Filtros lado izquierdo */}
          <div className="w-full lg:max-w-lg">
            <h2 className="text-sm font-semibold">Filtros de patrimonio</h2>

            <div className="mt-3 grid gap-3 text-xs md:grid-cols-2">
              <div>
                <div className="mb-1 text-slate-500 dark:text-slate-300">
                  Dueño
                </div>
                <select
                  value={ownerFilter}
                  onChange={(e) => setOwnerFilter(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="TODOS">Todos</option>
                  {ownerOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="mb-1 text-slate-500 dark:text-slate-300">
                  Buscar
                </div>
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                  placeholder="Nombre, banco, categoría, notas..."
                />
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-500 dark:text-slate-300">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                Dueño: {ownerFilter === "TODOS" ? "Todos" : ownerFilter}
              </span>
              {searchText && (
                <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200">
                  Buscando: “{searchText}”
                </span>
              )}
              <span className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                Modo: {viewMode === "personal" ? "Solo yo" : "Familia"}
              </span>
            </div>
          </div>

          {/* Totales filtrados */}
          <div className="grid w-full gap-3 text-xs sm:grid-cols-2 lg:max-w-md">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Activos filtrados
              </div>
              <div className="mt-1 text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                {formatMoney(filteredTotalActivos)}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Deudas filtradas
              </div>
              <div className="mt-1 text-lg font-semibold text-rose-600 dark:text-rose-400">
                {formatMoney(filteredTotalDeudas)}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Patrimonio filtrado
              </div>
              <div
                className={`mt-1 text-lg font-semibold ${
                  filteredPatrimonioNeto >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {formatMoney(filteredPatrimonioNeto)}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Pago mensual filtrado
              </div>
              <div className="mt-1 text-lg font-semibold text-amber-600 dark:text-amber-400">
                {formatMoney(filteredPagoMensual)}
              </div>
            </div>
          </div>
        </div>

        <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
          Los montos de esta sección y las tablas de abajo se calculan solo con
          los activos y deudas que coinciden con los filtros seleccionados y
          con el modo actual ({viewMode === "personal" ? "Solo yo" : "Familia"}
          ).
        </p>
      </section>

      {/* Formularios + tablas */}
      <section className="grid gap-4 lg:grid-cols-2">
        {/* Activos */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-2 text-sm font-semibold">Activos</h2>
          <p className="mb-3 text-[11px] text-slate-500 dark:text-slate-400">
            Registra todo lo que tienes a tu nombre o de tu familia:
            propiedades, autos, cuentas, inversiones, etc.
          </p>

          <form
            onSubmit={handleSaveAsset}
            className="mb-3 grid gap-2 text-xs md:grid-cols-4"
          >
            <input
              type="text"
              value={assetForm.name}
              onChange={(e) => handleChangeAssetForm("name", e.target.value)}
              className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Nombre (Casa, Auto, Ahorros...)"
            />
            <input
              type="text"
              value={assetForm.category}
              onChange={(e) =>
                handleChangeAssetForm("category", e.target.value)
              }
              className="md:col-span-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Categoría (Propiedad, Efectivo, Inversión...)"
            />
            <input
              type="number"
              value={assetForm.currentValue}
              onChange={(e) =>
                handleChangeAssetForm("currentValue", e.target.value)
              }
              className="md:col-span-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Valor actual"
            />
            {/* Dueño */}
            <div className="md:col-span-2">
              <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-300">
                Dueño
              </div>
              <select
                value={assetForm.owner}
                onChange={(e) =>
                  handleChangeAssetForm("owner", e.target.value)
                }
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              >
                {ownerOptions.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              value={assetForm.notes}
              onChange={(e) =>
                handleChangeAssetForm("notes", e.target.value)
              }
              className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 md:col-span-4"
              placeholder="Notas (ubicación, institución, algún detalle, etc.)"
            />
            <div className="mt-1 flex flex-wrap gap-2 md:col-span-4">
              <button
                type="submit"
                disabled={savingAsset}
                className="inline-flex flex-1 items-center justify-center rounded-lg bg-emerald-500 px-3 py-1 text-[11px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
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
                  onClick={cancelAssetEdit}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Cancelar edición
                </button>
              )}
            </div>
          </form>

          {loading && assets.length === 0 ? (
            <p className="text-[11px] text-slate-500">Cargando activos...</p>
          ) : filteredAssets.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              No hay activos que coincidan con los filtros.
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-100 dark:border-slate-700">
              <table className="min-w-full border-collapse text-[11px]">
                <thead className="sticky top-0 bg-slate-50 text-slate-600 dark:bg-slate-900/80 dark:text-slate-300">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium">Nombre</th>
                    <th className="px-2 py-1 text-left font-medium">
                      Categoría
                    </th>
                    <th className="px-2 py-1 text-left font-medium">Dueño</th>
                    <th className="px-2 py-1 text-right font-medium">Valor</th>
                    <th className="px-2 py-1 text-center font-medium">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssets.map((a) => (
                    <tr
                      key={a.id}
                      className="border-t border-slate-100 odd:bg-white even:bg-slate-50 hover:bg-slate-100/70 dark:border-slate-700 dark:odd:bg-slate-900 dark:even:bg-slate-800 dark:hover:bg-slate-700/60"
                    >
                      <td className="px-2 py-1">{a.name}</td>
                      <td className="px-2 py-1">{a.category ?? "-"}</td>
                      <td className="px-2 py-1">
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {a.owner ?? "-"}
                        </span>
                      </td>
                      <td className="px-2 py-1 text-right">
                        {formatMoney(a.current_value ?? 0)}
                      </td>
                      <td className="px-2 py-1 text-center">
                        <div className="flex justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleEditAsset(a)}
                            className="rounded px-1 py-0.5 text-[10px] text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-900/40"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAsset(a)}
                            className="rounded px-1 py-0.5 text-[10px] text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/40"
                          >
                            Eliminar
                          </button>
                        </div>
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
          <h2 className="mb-2 text-sm font-semibold">Deudas</h2>
          <p className="mb-3 text-[11px] text-slate-500 dark:text-slate-400">
            Registra hipotecas, créditos de auto, tarjetas y cualquier otro
            compromiso. El campo de pago mensual te ayuda a ver la carga fija al
            mes.
          </p>

          <form
            onSubmit={handleSaveDebt}
            className="mb-3 grid gap-2 text-xs md:grid-cols-4"
          >
            <input
              type="text"
              value={debtForm.name}
              onChange={(e) => handleChangeDebtForm("name", e.target.value)}
              className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Nombre (Hipoteca casa, Tarjeta BBVA...)"
            />
            <input
              type="text"
              value={debtForm.type}
              onChange={(e) => handleChangeDebtForm("type", e.target.value)}
              className="md:col-span-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Tipo (Hipoteca, Auto, Tarjeta...)"
            />
            <input
              type="text"
              value={debtForm.category}
              onChange={(e) =>
                handleChangeDebtForm("category", e.target.value)
              }
              className="md:col-span-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Categoría (Banco, Tienda, etc.)"
            />
            <input
              type="number"
              value={debtForm.totalAmount}
              onChange={(e) =>
                handleChangeDebtForm("totalAmount", e.target.value)
              }
              className="md:col-span-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Monto total"
            />
            <input
              type="number"
              value={debtForm.currentBalance}
              onChange={(e) =>
                handleChangeDebtForm("currentBalance", e.target.value)
              }
              className="md:col-span-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Saldo actual"
            />
            <input
              type="number"
              value={debtForm.monthlyPayment}
              onChange={(e) =>
                handleChangeDebtForm("monthlyPayment", e.target.value)
              }
              className="md:col-span-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Pago mensual fijo"
            />
            <input
              type="number"
              step="0.01"
              value={debtForm.interestRate}
              onChange={(e) =>
                handleChangeDebtForm("interestRate", e.target.value)
              }
              className="md:col-span-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Tasa interés (%)"
            />
            <input
              type="date"
              value={debtForm.dueDate}
              onChange={(e) => handleChangeDebtForm("dueDate", e.target.value)}
              className="md:col-span-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
            />
            {/* Dueño */}
            <div className="md:col-span-2">
              <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-300">
                De quién es la deuda
              </div>
              <select
                value={debtForm.owner}
                onChange={(e) =>
                  handleChangeDebtForm("owner", e.target.value)
                }
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
              >
                {ownerOptions.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              value={debtForm.notes}
              onChange={(e) => handleChangeDebtForm("notes", e.target.value)}
              className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 md:col-span-4"
              placeholder="Notas (institución, condiciones, etc.)"
            />
            <div className="mt-1 flex flex-wrap gap-2 md:col-span-4">
              <button
                type="submit"
                disabled={savingDebt}
                className="inline-flex flex-1 items-center justify-center rounded-lg bg-rose-500 px-3 py-1 text-[11px] font-semibold text-white hover:bg-rose-600 disabled:opacity-60"
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
                  onClick={cancelDebtEdit}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Cancelar edición
                </button>
              )}
            </div>
          </form>

          {loading && debts.length === 0 ? (
            <p className="text-[11px] text-slate-500">Cargando deudas...</p>
          ) : filteredDebts.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              No hay deudas que coincidan con los filtros.
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-100 dark:border-slate-700">
              <table className="min-w-full border-collapse text-[11px]">
                <thead className="sticky top-0 bg-slate-50 text-slate-600 dark:bg-slate-900/80 dark:text-slate-300">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium">Deuda</th>
                    <th className="px-2 py-1 text-left font-medium">Tipo</th>
                    <th className="px-2 py-1 text-left font-medium">Dueño</th>
                    <th className="px-2 py-1 text-right font-medium">Total</th>
                    <th className="px-2 py-1 text-right font-medium">Saldo</th>
                    <th className="px-2 py-1 text-right font-medium">
                      Pago mensual
                    </th>
                    <th className="px-2 py-1 text-left font-medium">Vence</th>
                    <th className="px-2 py-1 text-center font-medium">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDebts.map((d) => (
                    <tr
                      key={d.id}
                      className="border-t border-slate-100 odd:bg-white even:bg-slate-50 hover:bg-slate-100/70 dark:border-slate-700 dark:odd:bg-slate-900 dark:even:bg-slate-800 dark:hover:bg-slate-700/60"
                    >
                      <td className="px-2 py-1">{d.name}</td>
                      <td className="px-2 py-1">
                        {d.type || d.category || "-"}
                      </td>
                      <td className="px-2 py-1">
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {d.owner ?? "-"}
                        </span>
                      </td>
                      <td className="px-2 py-1 text-right">
                        {formatMoney(d.total_amount ?? 0)}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {formatMoney(d.current_balance ?? d.total_amount ?? 0)}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {formatMoney(d.monthly_payment ?? 0)}
                      </td>
                      <td className="px-2 py-1">
                        {formatDateDisplay(d.due_date)}
                      </td>
                      <td className="px-2 py-1 text-center">
                        <div className="flex justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleEditDebt(d)}
                            className="rounded px-1 py-0.5 text-[10px] text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-900/40"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDebt(d)}
                            className="rounded px-1 py-0.5 text-[10px] text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/40"
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {(error || familyError) && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
          {error && <p>{error}</p>}
          {familyError && <p className="mt-1">{familyError}</p>}
        </section>
      )}
    </main>
  );
}
