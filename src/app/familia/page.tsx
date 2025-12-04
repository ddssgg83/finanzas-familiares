"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

type Family = {
  id: string;
  name: string;
  user_id: string; // 👈 dueño de la familia (coincide con la tabla Supabase)
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

export default function FamiliaPage() {
  // Auth
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  // Familia
  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loadingFamily, setLoadingFamily] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Formularios
  const [newFamilyName, setNewFamilyName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  // Edición de familia (solo nombre)
const [editingFamily, setEditingFamily] = useState(false);
const [editFamilyName, setEditFamilyName] = useState("");

  // --------------------------------------------------
  //   AUTH: usuario actual + listener
  // --------------------------------------------------
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
        console.error("Error en login", error);
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
      setFamily(null);
      setMembers([]);
    } catch (err) {
      console.error("Error cerrando sesión", err);
    }
  };

  // --------------------------------------------------
  //   Cargar familia del usuario (si ya pertenece a una)
  // --------------------------------------------------
  useEffect(() => {
    if (!user) {
      setFamily(null);
      setMembers([]);
      return;
    }

    const loadFamily = async () => {
      setLoadingFamily(true);
      setError(null);

      try {
        const email = (user.email ?? "").toLowerCase();

        // 1) Buscar si el usuario ya es miembro de alguna familia
        const { data: memberRows, error: memberError } = await supabase
          .from("family_members")
          .select(
            "id,family_id,role,status,invited_email,user_id,created_at"
          )
          .or(`user_id.eq.${user.id},invited_email.eq.${email}`)
          .eq("status", "active")
          .limit(1);

        if (memberError) {
          console.error("Error buscando membresía de familia:", memberError);
          throw memberError;
        }

        if (!memberRows || memberRows.length === 0) {
          setFamily(null);
          setMembers([]);
          return;
        }

        const member = memberRows[0];

        // 2) Cargar la familia
        const { data: familyRow, error: familyError } = await supabase
          .from("families")
          .select("id,name,user_id,created_at") // 👈 user_id, no owner_id
          .eq("id", member.family_id)
          .single();

        if (familyError) {
          console.error("Error cargando familia:", familyError);
          throw familyError;
        }

        setFamily(familyRow as Family);
setEditFamilyName((familyRow as Family).name);


        // 3) Cargar miembros de esa familia
        const { data: allMembers, error: membersError } = await supabase
          .from("family_members")
          .select(
            "id,family_id,role,status,invited_email,user_id,created_at"
          )
          .eq("family_id", familyRow.id)
          .order("created_at", { ascending: true });

        if (membersError) {
          console.error("Error cargando miembros de familia:", membersError);
          throw membersError;
        }

        setMembers((allMembers ?? []) as FamilyMember[]);
      } catch (err: any) {
        console.error(
          "Error cargando familia (detalle):",
          err?.message ?? err
        );
        setError("No se pudo cargar la información de familia.");
      } finally {
        setLoadingFamily(false);
      }
    };

    loadFamily();
  }, [user]);

  // jefe de familia = el que creó el registro (user_id)
  const isOwner = !!(family && user && family.user_id === user.id);

  // --------------------------------------------------
  //   Crear nueva familia
  // --------------------------------------------------
  const handleCreateFamily = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const name = newFamilyName.trim();
    if (!name) {
      alert("Ingresa un nombre para la familia.");
      return;
    }

    try {
      setLoadingFamily(true);
      setError(null);

      // 1) Crear familia (usa user_id, que es la columna real de la tabla)
      const { data: fam, error: famError } = await supabase
        .from("families")
        .insert({
          name,
          user_id: user.id,
        })
        .select("id,name,user_id,created_at")
        .single();

      if (famError) {
        console.error("Error creando familia en Supabase:", famError);
        throw famError;
      }

      // 2) Agregarme como miembro owner
      const email = (user.email ?? "").toLowerCase();

      const { data: memberRow, error: memberError } = await supabase
        .from("family_members")
        .insert({
          family_id: fam.id,
          user_id: user.id,
          invited_email: email,
          role: "owner",
          status: "active",
        })
        .select(
          "id,family_id,role,status,invited_email,user_id,created_at"
        )
        .single();

      if (memberError) {
        console.error("Error insertando en family_members:", memberError);
        throw memberError;
      }

      setFamily(fam as Family);
      setEditFamilyName(name);        // 👈 rellenamos el input de edición
      setMembers([memberRow as FamilyMember]);
      setNewFamilyName("");
    } catch (err: any) {
      console.error("Error creando familia:", err?.message ?? err);
      setError("No se pudo crear la familia.");
    } finally {
      setLoadingFamily(false);
    }
  };
// --------------------------------------------------
//   Renombrar familia (solo jefe de familia)
// --------------------------------------------------
const handleRenameFamily = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!user || !family || !isOwner) return;

  const name = editFamilyName.trim();
  if (!name) {
    alert("Ingresa un nombre válido.");
    return;
  }

  try {
    setLoadingFamily(true);
    setError(null);

    const { data, error } = await supabase
      .from("families")
      .update({ name })
      .eq("id", family.id)
      .eq("user_id", user.id) // 👈 importante: usamos user_id, no owner_id
      .select("id,name,user_id,created_at")
      .single();

    if (error) {
      console.error("Error renombrando familia:", error);
      throw error;
    }

    setFamily(data as Family);
    setEditingFamily(false);
  } catch (err: any) {
    console.error("Error renombrando familia:", err?.message ?? err);
    setError("No se pudo actualizar el nombre de la familia.");
  } finally {
    setLoadingFamily(false);
  }
};
  // --------------------------------------------------
  //   Invitar miembro por correo
  // --------------------------------------------------
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !family || !isOwner) return;

    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      alert("Ingresa un correo a invitar.");
      return;
    }

    try {
      setLoadingFamily(true);
      setError(null);

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
          "id,family_id,role,status,invited_email,user_id,created_at"
        )
        .single();

      if (inviteError) {
        console.error("Error invitando miembro:", inviteError);
        throw inviteError;
      }

      setMembers((prev) => [...prev, data as FamilyMember]);
      setInviteEmail("");

      alert(
        "Miembro agregado como pendiente. Más adelante podemos conectar esta invitación con su cuenta cuando se registre."
      );
    } catch (err: any) {
      console.error("Error agregando miembro:", err?.message ?? err);
      setError("No se pudo agregar el miembro.");
    } finally {
      setLoadingFamily(false);
    }
  };

  // --------------------------------------------------
  //   Auth screen
  // --------------------------------------------------
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
                Crea tu cuenta para configurar tu grupo familiar.
              </p>
            </div>
            <ThemeToggle />
          </div>

          <h2 className="text-sm font-medium">
            {authMode === "login" ? "Inicia sesión" : "Crea tu cuenta"}
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

  // --------------------------------------------------
  //   Render app logueada
  // --------------------------------------------------
  return (
    <main className="flex flex-1 flex-col gap-4">
      <AppHeader
        title="Familia"
        subtitle="Configura tu grupo familiar para ver gastos y patrimonio consolidado."
        activeTab="familia"
        userEmail={user.email}
        onSignOut={handleSignOut}
      />

      <section className="space-y-4">
        {/* Estado de familia */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {loadingFamily ? (
  <p className="text-sm text-slate-600 dark:text-slate-300">
    Cargando información de tu familia...
  </p>
) : family ? (
  <>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-sm font-semibold mb-1">
          Tu familia: {family.name}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {isOwner
            ? "Eres el jefe de familia. Más adelante podrás ver aquí el resumen consolidado de gastos y patrimonio de todos."
            : "Perteneces a este grupo familiar. Más adelante podrás ver aquí el resumen consolidado que ve el jefe de familia."}
        </p>
      </div>

      {isOwner && !editingFamily && (
        <button
          type="button"
          onClick={() => {
            setEditingFamily(true);
            setEditFamilyName(family.name);
          }}
          className="mt-2 inline-flex items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Editar nombre
        </button>
      )}
    </div>

    {isOwner && editingFamily && (
      <form
        onSubmit={handleRenameFamily}
        className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <input
          type="text"
          value={editFamilyName}
          onChange={(e) => setEditFamilyName(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
          placeholder="Nombre de la familia"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-medium text-white hover:bg-sky-600"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingFamily(false);
              setEditFamilyName(family.name);
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
        </div>
      </form>
    )}
  </>
) : (
            <>
              <h2 className="text-sm font-semibold mb-2">
                Aún no tienes familia configurada
              </h2>
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                Crea una familia para agrupar a tu pareja, hijos u otros
                miembros. Después podremos conectar sus gastos y patrimonio.
              </p>
              <form
                onSubmit={handleCreateFamily}
                className="flex flex-col gap-2 sm:flex-row"
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
                  className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
                >
                  Crear familia
                </button>
              </form>
            </>
          )}

          {error && (
            <p className="mt-2 text-xs text-red-500">
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
                  podemos automatizar las invitaciones y el enlace con su cuenta.
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
                    className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
                  >
                    Agregar miembro
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
