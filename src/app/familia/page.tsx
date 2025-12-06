"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

type Family = {
  id: string;
  name: string;
  user_id: string; // dueño (jefe de familia)
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

type PendingInvite = {
  memberId: string;
  familyId: string;
  familyName: string;
  role: "owner" | "member";
  created_at: string;
};

export default function FamiliaPage() {
  // -------- AUTH --------
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // -------- DATA --------
  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loadingFamily, setLoadingFamily] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Formularios
  const [newFamilyName, setNewFamilyName] = useState("");
  const [editFamilyName, setEditFamilyName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [savingFamilyName, setSavingFamilyName] = useState(false);
  const [creatingFamily, setCreatingFamily] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [acceptingInviteId, setAcceptingInviteId] = useState<string | null>(
    null
  );
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

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
          if (!ignore) setAuthError("Hubo un problema al cargar tu sesión.");
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
      setFamily(null);
      setMembers([]);
      setPendingInvites([]);
    } catch (err) {
      console.error("Error cerrando sesión", err);
    }
  };

  // -------- Función para cargar familia / miembros / invitaciones --------
  const loadFamilyInfo = useCallback(
    async (currentUser: User) => {
      setLoadingFamily(true);
      setError(null);
      setPendingInvites([]);

      try {
        const userId = currentUser.id;
        const email = (currentUser.email ?? "").toLowerCase();

        // 1) Buscar membresía activa del usuario en family_members
        const { data: membershipRows, error: membershipError } = await supabase
          .from("family_members")
          .select(
            "id,family_id,user_id,invited_email,role,status,created_at"
          )
          .or(`user_id.eq.${userId},invited_email.eq.${email}`)
          .eq("status", "active")
          .limit(1);

        if (membershipError) {
          console.error("Error buscando membresía de familia:", membershipError);
          throw membershipError;
        }

        // Si NO tiene familia activa, revisamos si tiene invitaciones pendientes
        if (!membershipRows || membershipRows.length === 0) {
          const { data: pendingRows, error: pendingError } = await supabase
            .from("family_members")
            .select(
              "id,family_id,user_id,invited_email,role,status,created_at"
            )
            .eq("invited_email", email)
            .eq("status", "pending");

          if (pendingError) {
            console.error(
              "Error buscando invitaciones pendientes:",
              pendingError
            );
            throw pendingError;
          }

          if (!pendingRows || pendingRows.length === 0) {
            // Sin familia y sin invitaciones
            setFamily(null);
            setMembers([]);
            setEditFamilyName("");
            setPendingInvites([]);
            return;
          }

          // Hay invitaciones pendientes, cargamos info de las familias
          const familyIds = Array.from(
            new Set(pendingRows.map((p: any) => p.family_id))
          );

          const { data: familyRows, error: famsError } = await supabase
            .from("families")
            .select("id,name,user_id")
            .in("id", familyIds);

          if (famsError) {
            console.error("Error cargando familias de invitaciones:", famsError);
            throw famsError;
          }

          const famMap = new Map<string, { id: string; name: string }>();
          (familyRows ?? []).forEach((f: any) => {
            famMap.set(f.id, { id: f.id, name: f.name });
          });

          const invites: PendingInvite[] = (pendingRows ?? []).map(
            (p: any) => {
              const f = famMap.get(p.family_id);
              return {
                memberId: p.id,
                familyId: p.family_id,
                familyName: f?.name ?? "Familia sin nombre",
                role: p.role as "owner" | "member",
                created_at: p.created_at,
              };
            }
          );

          setFamily(null);
          setMembers([]);
          setEditFamilyName("");
          setPendingInvites(invites);
          return;
        }

        // 2) Sí tiene una familia activa
        const membership = membershipRows[0];

        const { data: familyRow, error: familyError } = await supabase
          .from("families")
          .select("id,name,user_id,created_at")
          .eq("id", membership.family_id)
          .single();

        if (familyError) {
          console.error("Error cargando familia:", familyError);
          throw familyError;
        }

        const fam = familyRow as Family;
        setFamily(fam);
        setEditFamilyName(fam.name);

        // 3) Cargar todos los miembros de esa familia
        const { data: allMembers, error: membersError } = await supabase
          .from("family_members")
          .select(
            "id,family_id,user_id,invited_email,role,status,created_at"
          )
          .eq("family_id", fam.id)
          .order("created_at", { ascending: true });

        if (membersError) {
          console.error("Error cargando miembros de familia:", membersError);
          throw membersError;
        }

        setMembers((allMembers ?? []) as FamilyMember[]);
        setPendingInvites([]);
      } catch (err: any) {
        console.error("Error cargando familia (detalle):", err?.message ?? err);
        setError("No se pudo cargar la información de familia.");
        setFamily(null);
        setMembers([]);
        setPendingInvites([]);
      } finally {
        setLoadingFamily(false);
      }
    },
    []
  );

  // -------- Cargar info cuando cambie user --------
  useEffect(() => {
    if (!user) {
      setFamily(null);
      setMembers([]);
      setPendingInvites([]);
      return;
    }
    loadFamilyInfo(user);
  }, [user, loadFamilyInfo]);

  const isOwner = !!(family && user && family.user_id === user.id);

  // -------- Crear nueva familia --------
  const handleCreateFamily = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const currentUser = user;
    if (!currentUser) {
      alert("Debes iniciar sesión para crear una familia.");
      return;
    }

    const name = newFamilyName.trim();
    if (!name) {
      alert("Ingresa un nombre para la familia.");
      return;
    }

    setCreatingFamily(true);
    setError(null);

    try {
      // 1) Crear familia
      const { data: fam, error: famError } = await supabase
        .from("families")
        .insert({
          name,
          user_id: currentUser.id,
        })
        .select("id,name,user_id,created_at")
        .single();

      if (famError) {
        console.error("Error creando familia en Supabase:", famError);
        throw famError;
      }

      const email = (currentUser.email ?? "").toLowerCase();

      // 2) Insertar al creador como owner activo
      const { data: memberRow, error: memberError } = await supabase
        .from("family_members")
        .insert({
          family_id: fam.id,
          user_id: currentUser.id,
          invited_email: email,
          role: "owner",
          status: "active",
        })
        .select(
          "id,family_id,user_id,invited_email,role,status,created_at"
        )
        .single();

      if (memberError) {
        console.error("Error insertando en family_members:", memberError);
        throw memberError;
      }

      setFamily(fam as Family);
      setMembers([memberRow as FamilyMember]);
      setNewFamilyName("");
      setEditFamilyName(fam.name);
      setPendingInvites([]);
    } catch (err: any) {
      console.error("Error creando familia:", err?.message ?? err);
      setError("No se pudo crear la familia.");
    } finally {
      setCreatingFamily(false);
    }
  };

  // -------- Renombrar familia --------
  const handleRenameFamily = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const currentUser = user;
    if (!currentUser || !family) return;
    if (!isOwner) {
      alert("Sólo el jefe de familia puede cambiar el nombre.");
      return;
    }

    const name = editFamilyName.trim();
    if (!name) {
      alert("Ingresa un nombre de familia válido.");
      return;
    }

    setSavingFamilyName(true);
    setError(null);

    try {
      const { data, error: updateError } = await supabase
        .from("families")
        .update({ name })
        .eq("id", family.id)
        .eq("user_id", currentUser.id)
        .select("id,name,user_id,created_at")
        .single();

      if (updateError) {
        console.error("Error renombrando familia:", updateError);
        throw updateError;
      }

      setFamily(data as Family);
      setEditFamilyName(data.name);
    } catch (err: any) {
      console.error("Error renombrando familia:", err?.message ?? err);
      setError("No se pudo actualizar el nombre de la familia.");
    } finally {
      setSavingFamilyName(false);
    }
  };

  // -------- Invitar miembro por correo --------
  const handleInvite = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const currentUser = user;
    if (!currentUser || !family) return;
    if (!isOwner) {
      alert("Sólo el jefe de familia puede invitar miembros.");
      return;
    }

    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      alert("Ingresa un correo a invitar.");
      return;
    }

    setInviting(true);
    setError(null);

    try {
      const { data, error: inviteError } = await supabase
        .from("family_members")
        .insert({
          family_id: family.id,
          invited_email: email,
          user_id: null,
          role: "member",
          status: "pending",
        })
        .select(
          "id,family_id,user_id,invited_email,role,status,created_at"
        )
        .single();

      if (inviteError) {
        console.error("Error invitando miembro:", inviteError);
        throw inviteError;
      }

      setMembers((prev) => [...prev, data as FamilyMember]);
      setInviteEmail("");

      alert(
        "Miembro agregado como pendiente. Más adelante podemos automatizar el envío de invitación y el enlace con su cuenta."
      );
    } catch (err: any) {
      console.error("Error agregando miembro:", err?.message ?? err);
      setError("No se pudo agregar el miembro.");
    } finally {
      setInviting(false);
    }
  };

  // -------- Aceptar invitación a familia --------
  const handleAcceptInvite = async (invite: PendingInvite) => {
    if (!user) return;

    const email = (user.email ?? "").toLowerCase();
    setAcceptingInviteId(invite.memberId);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from("family_members")
        .update({
          user_id: user.id,
          status: "active",
        })
        .eq("id", invite.memberId)
        .eq("invited_email", email);

      if (updateError) {
        console.error("Error aceptando invitación:", updateError);
        throw updateError;
      }

      await loadFamilyInfo(user);
      alert("Invitación aceptada. Ya formas parte de esta familia.");
    } catch (err: any) {
      console.error("Error al aceptar invitación:", err?.message ?? err);
      setError("No se pudo aceptar la invitación.");
    } finally {
      setAcceptingInviteId(null);
    }
  };

  // -------- Quitar miembro (sólo owner) --------
  const handleRemoveMember = async (memberId: string) => {
    if (!user || !family) return;
    if (!isOwner) {
      alert("Sólo el jefe de familia puede quitar miembros.");
      return;
    }

    const confirmRemove = window.confirm(
      "¿Seguro que quieres quitar a este miembro de la familia?"
    );
    if (!confirmRemove) return;

    setRemovingMemberId(memberId);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from("family_members")
        .delete()
        .eq("id", memberId)
        .eq("family_id", family.id);

      if (deleteError) {
        console.error("Error quitando miembro:", deleteError);
        throw deleteError;
      }

      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch (err: any) {
      console.error("Error al quitar miembro:", err?.message ?? err);
      setError("No se pudo quitar el miembro.");
    } finally {
      setRemovingMemberId(null);
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
      <div className="flex flex-1 flex-col items-center justify-center text-sm text-slate-600 dark:text-slate-300">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-semibold">Familia</p>
          <p className="text-slate-500 dark:text-slate-400">
            Inicia sesión desde el dashboard para configurar tu grupo familiar y
            ver el patrimonio consolidado más adelante.
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

  // -------- UI APP --------
  return (
    <main className="flex flex-1 flex-col gap-4">
      <AppHeader
        title="Familia"
        subtitle="Configura tu grupo familiar para ver gastos y patrimonio consolidado."
        activeTab="familia"
        userEmail={user.email}
        onSignOut={handleSignOut}
      />

      {/* Estado de familia */}
      <section className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {loadingFamily ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Cargando información de tu familia...
            </p>
          ) : family ? (
            <>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="mb-1 text-sm font-semibold">
                    Tu familia: {family.name}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {isOwner
                      ? "Eres el jefe de familia. Más adelante podrás ver aquí el resumen consolidado de gastos y patrimonio de todos."
                      : "Perteneces a este grupo familiar. Más adelante podrás ver aquí el resumen consolidado que ve el jefe de familia."}
                  </p>
                </div>

                {isOwner && (
                  <form
                    onSubmit={handleRenameFamily}
                    className="flex flex-col gap-2 text-xs md:flex-row md:items-center"
                  >
                    <input
                      type="text"
                      value={editFamilyName}
                      onChange={(e) => setEditFamilyName(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 md:w-56"
                      placeholder="Nombre de la familia"
                    />
                    <button
                      type="submit"
                      disabled={savingFamilyName}
                      className="rounded-lg bg-sky-500 px-3 py-1 text-xs font-medium text-white hover:bg-sky-600 disabled:opacity-60"
                    >
                      {savingFamilyName ? "Guardando..." : "Guardar nombre"}
                    </button>
                  </form>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Invitaciones pendientes */}
              {pendingInvites.length > 0 && (
                <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-900/40">
                  <h3 className="mb-2 text-sm font-semibold">
                    Invitaciones a familia
                  </h3>
                  <p className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">
                    Estas familias te han invitado a unirte. Acepta una para
                    formar parte de su grupo.
                  </p>
                  <div className="space-y-2">
                    {pendingInvites.map((inv) => (
                      <div
                        key={inv.memberId}
                        className="flex flex-col justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-900 md:flex-row md:items-center"
                      >
                        <div>
                          <div className="text-sm font-semibold">
                            {inv.familyName}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            Rol:{" "}
                            {inv.role === "owner"
                              ? "Jefe de familia"
                              : "Miembro"}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleAcceptInvite(inv)}
                            disabled={acceptingInviteId === inv.memberId}
                            className="rounded-lg bg-emerald-500 px-3 py-1 text-[11px] font-medium text-white hover:bg-emerald-600 disabled:opacity-60"
                          >
                            {acceptingInviteId === inv.memberId
                              ? "Uniéndome..."
                              : "Unirme a esta familia"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <h2 className="mb-2 text-sm font-semibold">
                Aún no tienes familia configurada
              </h2>
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                Crea una familia para agrupar a tu pareja, hijos u otros
                miembros. Después podremos conectar sus gastos y patrimonio para
                mostrar un resumen consolidado.
              </p>

              <form
                onSubmit={handleCreateFamily}
                className="flex flex-col gap-2 text-sm sm:flex-row"
              >
                <input
                  type="text"
                  value={newFamilyName}
                  onChange={(e) => setNewFamilyName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                  placeholder="Ej. Familia Garza Sloane"
                />
                <button
                  type="submit"
                  disabled={creatingFamily}
                  className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-60"
                >
                  {creatingFamily ? "Creando..." : "Crear familia"}
                </button>
              </form>
            </>
          )}

          {error && (
            <p className="mt-2 text-xs text-rose-500 dark:text-rose-400">
              {error}
            </p>
          )}
        </div>

        {/* Miembros */}
        {family && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-2 text-sm font-semibold">Miembros de la familia</h2>

            {members.length === 0 ? (
              <p className="text-xs text-slate-500">
                Aún no hay miembros registrados.
              </p>
            ) : (
              <div className="overflow-x-auto text-sm">
                <table className="min-w-full border border-slate-200 text-left text-xs dark:border-slate-700 md:text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900">
                    <tr>
                      <th className="border-b px-2 py-2">Correo</th>
                      <th className="border-b px-2 py-2">Rol</th>
                      <th className="border-b px-2 py-2">Estado</th>
                      <th className="border-b px-2 py-2">Vinculado</th>
                      <th className="border-b px-2 py-2 text-center">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr
                        key={m.id}
                        className="odd:bg-white even:bg-slate-50 dark:odd:bg-slate-800 dark:even:bg-slate-900"
                      >
                        <td className="border-t px-2 py-1">
                          {m.invited_email}
                        </td>
                        <td className="border-t px-2 py-1">
                          {m.role === "owner" ? "Jefe de familia" : "Miembro"}
                        </td>
                        <td className="border-t px-2 py-1">
                          {m.status === "active"
                            ? "Activo"
                            : m.status === "pending"
                            ? "Pendiente"
                            : "Inactivo"}
                        </td>
                        <td className="border-t px-2 py-1">
                          {m.user_id ? "Sí" : "No todavía"}
                        </td>
                        <td className="border-t px-2 py-1 text-center">
                          {isOwner && m.role !== "owner" && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(m.id)}
                              disabled={removingMemberId === m.id}
                              className="text-[11px] text-rose-500 hover:underline disabled:opacity-60"
                            >
                              {removingMemberId === m.id
                                ? "Quitando..."
                                : "Quitar"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {isOwner && (
              <div className="mt-4 border-t border-slate-200 pt-3 text-xs dark:border-slate-700">
                <h3 className="mb-2 text-sm font-semibold">
                  Invitar nuevo miembro
                </h3>
                <p className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">
                  Por ahora sólo registramos el correo y el estado. Más adelante
                  podemos automatizar las invitaciones y enlazar automáticamente
                  con la cuenta de cada miembro.
                </p>
                <form
                  onSubmit={handleInvite}
                  className="flex flex-col gap-2 sm:flex-row"
                >
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                    placeholder="correo@ejemplo.com"
                  />
                  <button
                    type="submit"
                    disabled={inviting}
                    className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-60"
                  >
                    {inviting ? "Agregando..." : "Agregar miembro"}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
