"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

type FamilyRole = "owner" | "member";

type Family = {
  id: string;
  name: string;
  owner_id: string;
};

type FamilyMember = {
  id: string;
  family_id: string;
  user_id: string;
  role: FamilyRole;
};

type CardWithSharing = {
  id: string;
  name: string;
  sharedWith: string[]; // user_id de miembros
};

type ActiveTab = "overview" | "members" | "cards";

export default function FamilyPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [role, setRole] = useState<FamilyRole | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");

  const [familyName, setFamilyName] = useState("");
  const [joinFamilyId, setJoinFamilyId] = useState("");

  const [cards, setCards] = useState<CardWithSharing[]>([]);
  const [savingSharing, setSavingSharing] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ---------- Helpers UI ----------
  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 4000);
  };

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 5000);
  };

  // ---------- Cargar usuario ----------
  useEffect(() => {
    const fetchUser = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error) {
        console.error("Error al obtener usuario", error);
        showError("Hubo un problema al obtener tu sesión.");
      }

      setUser(user ?? null);
    };

    fetchUser();
  }, []);

  // ---------- Cargar familia + miembros + tarjetas ----------
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const loadFamilyData = async () => {
      setLoading(true);

      // 1. Ver si este usuario ya pertenece a alguna familia
      const { data: membershipRows, error: membershipError } = await supabase
        .from("family_members")
        .select("id, family_id, user_id, role")
        .eq("user_id", user.id);

      if (membershipError) {
        console.error(
          "Supabase error al obtener membership:",
          (membershipError as any).message || membershipError
        );
        // En caso de error, tratamos como que no tiene familia
        setFamily(null);
        setMembers([]);
        setRole(null);
        setCards([]);
        setLoading(false);
        return;
      }

      const membership =
        membershipRows && membershipRows.length > 0
          ? (membershipRows[0] as FamilyMember)
          : null;

      if (!membership) {
        // No tiene familia todavía
        setFamily(null);
        setMembers([]);
        setRole(null);
        setCards([]);
        setLoading(false);
        return;
      }

      setRole(membership.role as FamilyRole);

      // 2. Cargar familia
      const { data: familyRow, error: familyError } = await supabase
        .from("families")
        .select("id, name, owner_id")
        .eq("id", membership.family_id)
        .single();

      if (familyError || !familyRow) {
        console.error(
          "Error al obtener familia:",
          (familyError as any)?.message || familyError
        );
        showError("No se pudo cargar la información de la familia.");
        setFamily(null);
        setMembers([]);
        setRole(null);
        setCards([]);
        setLoading(false);
        return;
      }

      const currentFamily = familyRow as Family;
      setFamily(currentFamily);

      // 3. Cargar miembros de la familia
      const { data: membersRows, error: membersError } = await supabase
        .from("family_members")
        .select("id, family_id, user_id, role")
        .eq("family_id", currentFamily.id);

      if (membersError) {
        console.error(
          "Error al obtener miembros:",
          (membersError as any).message || membersError
        );
        showError("No se pudo cargar la lista de miembros.");
        setMembers([]);
      } else {
        setMembers((membersRows ?? []) as FamilyMember[]);
      }

      // 4. Cargar tarjetas según rol
      if (membership.role === "owner") {
        await loadOwnerCardsWithSharing(user.id);
      } else {
        await loadMemberCards(user.id);
      }

      setLoading(false);
    };

    loadFamilyData();
  }, [user]);

  // ---------- Cargar tarjetas (dueño) ----------
  const loadOwnerCardsWithSharing = async (ownerId: string) => {
    const { data: cardRows, error: cardsError } = await supabase
      .from("cards")
      .select("id, name")
      .eq("owner_id", ownerId);

    if (cardsError) {
      console.error(
        "Error al obtener tarjetas:",
        (cardsError as any).message || cardsError
      );
      showError("No se pudieron cargar tus tarjetas.");
      setCards([]);
      return;
    }

    const rows = cardRows ?? [];
    const cardsWith: CardWithSharing[] = [];

    for (const card of rows as { id: string; name: string }[]) {
      const { data: cuRows, error: cuError } = await supabase
        .from("card_users")
        .select("user_id")
        .eq("card_id", card.id);

      if (cuError) {
        console.error(
          "Error al obtener card_users:",
          (cuError as any).message || cuError
        );
        cardsWith.push({
          id: card.id,
          name: card.name,
          sharedWith: [],
        });
      } else {
        cardsWith.push({
          id: card.id,
          name: card.name,
          sharedWith: (cuRows ?? []).map((r: any) => r.user_id as string),
        });
      }
    }

    setCards(cardsWith);
  };

  // ---------- Cargar tarjetas (miembro) ----------
  const loadMemberCards = async (memberUserId: string) => {
    const { data: cuRows, error: cuError } = await supabase
      .from("card_users")
      .select("card_id")
      .eq("user_id", memberUserId);

    if (cuError) {
      console.error(
        "Error al obtener card_users para miembro:",
        (cuError as any).message || cuError
      );
      setCards([]);
      return;
    }

    const cardIds = (cuRows ?? []).map((r: any) => r.card_id as string);
    if (cardIds.length === 0) {
      setCards([]);
      return;
    }

    const { data: cardsRows, error: cardsError } = await supabase
      .from("cards")
      .select("id, name")
      .in("id", cardIds);

    if (cardsError) {
      console.error(
        "Error al obtener tarjetas para miembro:",
        (cardsError as any).message || cardsError
      );
      setCards([]);
      return;
    }

    setCards(
      (cardsRows ?? []).map((c: any) => ({
        id: c.id as string,
        name: c.name as string,
        sharedWith: [memberUserId],
      }))
    );
  };

  // ---------- Crear familia ----------
  const handleCreateFamily = async () => {
    if (!user) {
      showError("Debes iniciar sesión para crear una familia.");
      return;
    }
    if (!familyName.trim()) {
      showError("Escribe un nombre para tu familia.");
      return;
    }

    setLoading(true);

    const { data: famRows, error: famError } = await supabase
      .from("families")
      .insert({
        name: familyName.trim(),
        owner_id: user.id,
      })
      .select("id, name, owner_id")
      .single();

    if (famError || !famRows) {
      console.error(
        "Error al crear familia:",
        (famError as any)?.message || famError
      );
      showError("No se pudo crear la familia.");
      setLoading(false);
      return;
    }

    const newFamily = famRows as Family;

    const { error: memberError } = await supabase.from("family_members").insert({
      family_id: newFamily.id,
      user_id: user.id,
      role: "owner",
    });

    if (memberError) {
      console.error(
        "Error al crear membership owner:",
        (memberError as any).message || memberError
      );
      showError(
        "La familia se creó pero hubo un problema al asignarte como jefe."
      );
      setLoading(false);
      return;
    }

    showMessage("Familia creada correctamente. Eres el jefe de familia.");
    setFamilyName("");

    await loadOwnerCardsWithSharing(user.id);

    setFamily(newFamily);
    setRole("owner");
    setMembers([
      {
        id: "self-temp",
        family_id: newFamily.id,
        user_id: user.id,
        role: "owner",
      },
    ]);

    setLoading(false);
  };

  // ---------- Unirse a una familia existente ----------
  const handleJoinFamily = async () => {
    if (!user) {
      showError("Debes iniciar sesión para unirte a una familia.");
      return;
    }
    if (!joinFamilyId.trim()) {
      showError("Escribe un código de familia.");
      return;
    }

    setLoading(true);

    const { data: famRow, error: famError } = await supabase
      .from("families")
      .select("id, name, owner_id")
      .eq("id", joinFamilyId.trim())
      .single();

    if (famError || !famRow) {
      console.error(
        "Error al buscar familia:",
        (famError as any)?.message || famError
      );
      showError("No se encontró una familia con ese código.");
      setLoading(false);
      return;
    }

    const { error: memberError } = await supabase.from("family_members").insert({
      family_id: famRow.id,
      user_id: user.id,
      role: "member",
    });

    if (memberError) {
      console.error(
        "Error al unirse a familia:",
        (memberError as any).message || memberError
      );
      showError(
        "No pudiste unirte a la familia. Verifica que no estés ya en un grupo."
      );
      setLoading(false);
      return;
    }

    showMessage("Te uniste a la familia correctamente.");
    setJoinFamilyId("");

    setFamily(famRow as Family);
    setRole("member");

    setLoading(false);
  };

  // ---------- Toggle sharing de tarjeta con miembro ----------
  const handleToggleCardSharing = async (cardId: string, memberUserId: string) => {
    if (!family || role !== "owner") return;

    setSavingSharing(true);

    const card = cards.find((c) => c.id === cardId);
    if (!card) {
      setSavingSharing(false);
      return;
    }

    const alreadyShared = card.sharedWith.includes(memberUserId);

    if (alreadyShared) {
      const { error: delError } = await supabase
        .from("card_users")
        .delete()
        .eq("card_id", cardId)
        .eq("user_id", memberUserId);

      if (delError) {
        console.error(
          "Error al quitar acceso a la tarjeta:",
          (delError as any).message || delError
        );
        showError("No se pudo quitar el acceso a la tarjeta.");
        setSavingSharing(false);
        return;
      }

      setCards((prev) =>
        prev.map((c) =>
          c.id === cardId
            ? {
                ...c,
                sharedWith: c.sharedWith.filter((id) => id !== memberUserId),
              }
            : c
        )
      );
      showMessage("Acceso a tarjeta actualizado.");
    } else {
      const { error: addError } = await supabase
        .from("card_users")
        .insert({ card_id: cardId, user_id: memberUserId });

      if (addError) {
        console.error(
          "Error al compartir tarjeta:",
          (addError as any).message || addError
        );
        showError("No se pudo compartir la tarjeta con este miembro.");
        setSavingSharing(false);
        return;
      }

      setCards((prev) =>
        prev.map((c) =>
          c.id === cardId
            ? { ...c, sharedWith: [...c.sharedWith, memberUserId] }
            : c
        )
      );
      showMessage("Tarjeta compartida con el miembro.");
    }

    setSavingSharing(false);
  };

  // ---------- Render helpers ----------
  const renderNoFamily = () => {
    if (!user) {
      return (
        <div className="mt-6 rounded-xl border p-4 text-sm text-muted-foreground">
          Inicia sesión para crear o administrar un grupo familiar.
        </div>
      );
    }

    return (
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border p-4">
          <h2 className="mb-2 text-lg font-semibold">Crear familia</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Serás el <strong>Jefe de familia</strong> y podrás invitar miembros y
            asignar tarjetas compartidas.
          </p>
          <label className="mb-2 block text-sm font-medium">
            Nombre de la familia
          </label>
          <input
            type="text"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            className="mb-3 w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="Ej. Familia Garza Sloane"
          />
          <button
            onClick={handleCreateFamily}
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            disabled={loading}
          >
            {loading ? "Creando..." : "Crear familia"}
          </button>
        </div>

        <div className="rounded-xl border p-4">
          <h2 className="mb-2 text-lg font-semibold">Unirme a familia</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Escribe el <strong>código de familia</strong> que te comparta el
            jefe (es el ID de la familia).
          </p>
          <label className="mb-2 block text-sm font-medium">
            Código de familia
          </label>
          <input
            type="text"
            value={joinFamilyId}
            onChange={(e) => setJoinFamilyId(e.target.value)}
            className="mb-3 w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="Ej. 0b9c9b1a-..."
          />
          <button
            onClick={handleJoinFamily}
            className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            disabled={loading}
          >
            {loading ? "Uniéndome..." : "Unirme a la familia"}
          </button>
        </div>
      </div>
    );
  };

  const renderTabs = () => {
    if (!family) return null;

    return (
      <div className="mt-2 flex gap-2 border-b pb-2 text-sm">
        <button
          onClick={() => setActiveTab("overview")}
          className={`rounded-lg px-3 py-1 ${
            activeTab === "overview"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          Resumen
        </button>
        <button
          onClick={() => setActiveTab("members")}
          className={`rounded-lg px-3 py-1 ${
            activeTab === "members"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          Miembros
        </button>
        <button
          onClick={() => setActiveTab("cards")}
          className={`rounded-lg px-3 py-1 ${
            activeTab === "cards"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          Tarjetas compartidas
        </button>
      </div>
    );
  };

  const renderOverview = () => {
    if (!family) return null;

    const isOwner = role === "owner";

    return (
      <div className="mt-4 space-y-4">
        <div className="rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{family.name}</h2>
              <p className="text-sm text-muted-foreground">
                Tu rol en esta familia:{" "}
                <span className="font-medium">
                  {role === "owner" ? "Jefe de familia" : "Miembro"}
                </span>
              </p>
            </div>
            {isOwner && (
              <div className="rounded-lg bg-muted px-3 py-2 text-xs">
                <p className="font-semibold uppercase tracking-wide text-muted-foreground">
                  Código de invitación
                </p>
                <p className="font-mono text-[11px] break-all">{family.id}</p>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Miembros
            </p>
            <p className="mt-2 text-2xl font-bold">{members.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Incluye al jefe y todos los miembros registrados.
            </p>
          </div>

          <div className="rounded-xl border p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Tarjetas visibles
            </p>
            <p className="mt-2 text-2xl font-bold">{cards.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isOwner
                ? "Tarjetas que puedes compartir con tu familia."
                : "Tarjetas que tu jefe te compartió."}
            </p>
          </div>

          <div className="rounded-xl border p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Próximo paso
            </p>
            <p className="mt-2 text-sm">
              {isOwner
                ? "Comparte el código de familia con tu pareja/hijos y asigna tarjetas."
                : "Pide a tu jefe de familia que te comparta las tarjetas que usarás."}
            </p>
          </div>
        </div>
      </div>
    );
  };

  const renderMembers = () => {
    if (!family) return null;

    if (members.length === 0) {
      return (
        <div className="mt-4 rounded-xl border p-4 text-sm text-muted-foreground">
          No hay miembros todavía. Si eres jefe, comparte el código de familia
          para que se unan.
        </div>
      );
    }

    return (
      <div className="mt-4 rounded-xl border p-4">
        <h2 className="mb-3 text-lg font-semibold">Miembros de la familia</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          *Por ahora se muestran los IDs internos de usuario. Más adelante
          podemos conectar con la tabla de perfiles para ver nombres y correos.
        </p>
        <div className="space-y-2 text-sm">
          {members.map((m) => (
            <div
              key={m.id + m.user_id}
              className="flex items-center justify-between rounded-lg bg-muted px-3 py-2"
            >
              <div>
                <p className="font-medium truncate max-w-xs">
                  Usuario:{" "}
                  <span className="font-mono text-[11px]">
                    {m.user_id.slice(0, 8)}...
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Rol: {m.role === "owner" ? "Jefe de familia" : "Miembro"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderCards = () => {
    if (!family) return null;

    const isOwner = role === "owner";

    if (!isOwner) {
      return (
        <div className="mt-4 rounded-xl border p-4">
          <h2 className="mb-3 text-lg font-semibold">Tarjetas asignadas</h2>
          {cards.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no tienes tarjetas compartidas. Pídele al jefe de familia que
              te asigne alguna de sus tarjetas.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {cards.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-lg bg-muted px-3 py-2"
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground">
                    Tarjeta compartida contigo
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }

    return (
      <div className="mt-4 rounded-xl border p-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Tarjetas compartidas</h2>
            <p className="text-sm text-muted-foreground">
              Asigna qué miembros pueden usar cada una de tus tarjetas. Los
              movimientos que ellos registren con esas tarjetas se agruparán en
              tu vista general de gastos.
            </p>
          </div>
        </div>

        {cards.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No tienes tarjetas registradas a tu nombre. Crea tarjetas primero en
            el módulo de gastos/tarjetas.
          </p>
        ) : members.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Aún no hay miembros en la familia. Comparte el código para que se
            unan y puedas asignarles tarjetas.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {cards.map((card) => (
              <div
                key={card.id}
                className="rounded-lg border bg-card p-3 text-sm"
              >
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-semibold">{card.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {card.sharedWith.length} miembro(s) con acceso
                  </p>
                </div>

                <div className="space-y-1">
                  {members.map((m) => (
                    <label
                      key={m.id + m.user_id}
                      className="flex items-center justify-between rounded-md bg-muted px-2 py-1"
                    >
                      <div className="flex flex-col">
                        <span className="text-xs font-medium">
                          {m.role === "owner"
                            ? "Tú (jefe de familia)"
                            : "Miembro"}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {m.user_id.slice(0, 8)}...
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        disabled={m.role === "owner" || savingSharing}
                        checked={
                          m.role === "owner"
                            ? true
                            : card.sharedWith.includes(m.user_id)
                        }
                        onChange={() =>
                          m.role === "owner"
                            ? undefined
                            : handleToggleCardSharing(card.id, m.user_id)
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {savingSharing && (
          <p className="mt-3 text-xs text-muted-foreground">
            Guardando cambios en tarjetas...
          </p>
        )}
      </div>
    );
  };

  // ---------- Render principal ----------
  return (
  <div className="min-h-screen bg-background text-foreground">
    <AppHeader
  title="Familia"
  subtitle="Administra tu grupo familiar y las tarjetas compartidas."
  activeTab="familia"
  userEmail={user?.email ?? ""}
  onSignOut={async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }}
/>
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pb-8 pt-4">
      {/* Ya no necesitamos el h1 aquí porque lo muestra AppHeader */}
       {message && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-200">
            {message}
          </div>
        )}

        {errorMsg && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/60 dark:text-red-200">
            {errorMsg}
          </div>
        )}

        {loading && (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        )}

        {!loading && !family && renderNoFamily()}

        {!loading && family && (
          <>
            {renderTabs()}
            {activeTab === "overview" && renderOverview()}
            {activeTab === "members" && renderMembers()}
            {activeTab === "cards" && renderCards()}
          </>
        )}
      </main>
    </div>
  );
}
