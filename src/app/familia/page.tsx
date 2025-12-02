"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useTheme } from "next-themes";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MainNavTabs } from "@/components/MainNavTabs";


export const dynamic = "force-dynamic";

type FamilyMember = {
  id: string;
  name: string;
  relation: string | null;
  role: string | null; // "admin" | "editor" | "viewer"
  email: string | null;
  created_at?: string;
};

type MemberForm = {
  name: string;
  relation: string;
  role: "admin" | "editor" | "viewer";
  email: string;
};

function formatDateDisplay(ymd: string | null | undefined) {
  if (!ymd) return "";
  const s = ymd.slice(0, 10);
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

export default function FamiliaPage() {
  // Auth
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Estado principal
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<MemberForm>({
    name: "",
    relation: "",
    role: "admin",
    email: "",
  });

  // Tema
  const { theme, systemTheme } = useTheme();
  const [mountedTheme, setMountedTheme] = useState(false);
  useEffect(() => setMountedTheme(true), []);
  const currentTheme = theme === "system" ? systemTheme : theme;
  const isDark = mountedTheme && currentTheme === "dark";

  // -------- AUTH --------
  useEffect(() => {
    let ignore = false;

    async function loadUser() {
      setAuthLoading(true);
      try {
        const { data } = await supabase.auth.getUser();
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
      setMembers([]);
    } catch (err) {
      console.error("Error cerrando sesión", err);
    }
  };

  // -------- Cargar miembros --------
  useEffect(() => {
    if (!user) {
      setMembers([]);
      return;
    }

    const userId = user.id;

    async function loadMembers() {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from("family_members")
          .select("id,name,relation,role,email,created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: true });

        if (error) throw error;

        setMembers((data ?? []) as FamilyMember[]);
      } catch (err) {
        console.error("Error cargando miembros de familia", err);
        setError("No se pudieron cargar los miembros de tu familia.");
      } finally {
        setLoading(false);
      }
    }

    loadMembers();
  }, [user]);

  // -------- Formulario --------
  const handleChangeForm = (field: keyof MemberForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value } as MemberForm));
  };

  const resetForm = () => {
    setForm({
      name: "",
      relation: "",
      role: "admin",
      email: "",
    });
  };

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert("Debes iniciar sesión para gestionar tu familia.");
      return;
    }

    if (!form.name.trim()) {
      alert("Ponle un nombre al miembro de la familia.");
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("family_members")
        .insert({
          user_id: user.id,
          name: form.name.trim(),
          relation: form.relation.trim() || null,
          role: form.role,
          email: form.email.trim() || null,
        })
        .select("id,name,relation,role,email,created_at")
        .single();

      if (error) throw error;

      setMembers((prev) => [...prev, data as FamilyMember]);
      resetForm();
    } catch (err) {
      console.error("Error guardando miembro", err);
      alert("No se pudo guardar el miembro.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMember = async (member: FamilyMember) => {
    if (!user) {
      alert("Debes iniciar sesión para eliminar miembros.");
      return;
    }
    if (!confirm(`¿Eliminar a "${member.name}" de tu familia?`)) return;

    try {
      const { error } = await supabase
        .from("family_members")
        .delete()
        .eq("id", member.id)
        .eq("user_id", user.id);

      if (error) throw error;

      setMembers((prev) => prev.filter((m) => m.id !== member.id));
    } catch (err) {
      console.error("Error eliminando miembro", err);
      alert("No se pudo eliminar al miembro.");
    }
  };

  // -------- UI: auth --------
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
              <h1 className="text-lg font-semibold">Familia</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inicia sesión desde el dashboard para manejar los miembros de tu
                familia.
              </p>
            </div>
            <ThemeToggle />
          </div>

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

  // Pequeño resumen por rol
  const totalAdmins = members.filter((m) => m.role === "admin").length;
  const totalEditors = members.filter((m) => m.role === "editor").length;
  const totalViewers = members.filter((m) => m.role === "viewer").length;

  // -------- UI: página familia --------
  return (
    <main className="flex flex-1 flex-col gap-4">
      {/* Header con navegación */}
      <header className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold sm:text-xl">
            Familia y permisos
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Define quién forma parte de tu familia y qué puede hacer dentro de
            la app.
          </p>

          <MainNavTabs />

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

      {/* Resumen rápido */}
      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Miembros totales
          </div>
          <div className="mt-1 text-2xl font-semibold text-sky-600 dark:text-sky-400">
            {members.length}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Personas que pueden ver o editar tus finanzas.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Administradores
          </div>
          <div className="mt-1 text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
            {totalAdmins}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Pueden ver y editar todo, incluso miembros.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Editores
          </div>
          <div className="mt-1 text-2xl font-semibold text-amber-500 dark:text-amber-300">
            {totalEditors}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Pueden capturar movimientos y patrimonio.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Solo lectura
          </div>
          <div className="mt-1 text-2xl font-semibold text-fuchsia-500 dark:text-fuchsia-300">
            {totalViewers}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Sólo pueden ver, sin editar nada.
          </p>
        </div>
      </section>

      {/* Formulario + tabla */}
      <section className="grid gap-4 lg:grid-cols-2">
        {/* Formulario */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-2 text-sm font-semibold">
            Agregar miembro de la familia
          </h2>
          <p className="mb-3 text-[11px] text-slate-500 dark:text-slate-400">
            Ejemplos: <b>David – Papá – admin</b>,{" "}
            <b>Esposa – Mamá – editor</b>, <b>Hijos – viewer</b>.
          </p>

          <form
            onSubmit={handleSaveMember}
            className="space-y-2 text-xs md:text-sm"
          >
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-300">
                  Nombre
                </div>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => handleChangeForm("name", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                  placeholder="David, Esposa, Hijo mayor..."
                />
              </div>

              <div>
                <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-300">
                  Relación
                </div>
                <input
                  type="text"
                  value={form.relation}
                  onChange={(e) =>
                    handleChangeForm("relation", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                  placeholder="Papá, Mamá, Hijo, Hija..."
                />
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-300">
                  Rol en la app
                </div>
                <select
                  value={form.role}
                  onChange={(e) =>
                    handleChangeForm(
                      "role",
                      e.target.value as MemberForm["role"]
                    )
                  }
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="admin">Admin (ve y edita todo)</option>
                  <option value="editor">
                    Editor (captura gastos y patrimonio)
                  </option>
                  <option value="viewer">
                    Solo lectura (ve pero no cambia nada)
                  </option>
                </select>
              </div>

              <div>
                <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-300">
                  Correo (opcional)
                </div>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    handleChangeForm("email", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                  placeholder="para invitarlos en el futuro"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="mt-2 inline-flex items-center justify-center rounded-lg bg-indigo-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-600 disabled:opacity-60"
            >
              {saving ? "Guardando..." : "Agregar miembro"}
            </button>

            {error && (
              <p className="mt-1 text-xs text-rose-500">{error}</p>
            )}
          </form>
        </div>

        {/* Tabla de miembros */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-2 text-sm font-semibold">Miembros registrados</h2>
          {loading && members.length === 0 ? (
            <p className="text-xs text-slate-500">Cargando miembros...</p>
          ) : members.length === 0 ? (
            <p className="text-xs text-slate-500">
              Aún no has agregado miembros. Empieza por registrarte a ti mismo
              como <b>admin</b>.
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
                      Relación
                    </th>
                    <th className="px-2 py-1 text-left font-medium">
                      Rol
                    </th>
                    <th className="px-2 py-1 text-left font-medium">
                      Correo
                    </th>
                    <th className="px-2 py-1 text-left font-medium">
                      Alta
                    </th>
                    <th className="px-2 py-1 text-center font-medium">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr
                      key={m.id}
                      className="odd:bg-white even:bg-slate-50 dark:odd:bg-slate-900 dark:even:bg-slate-800"
                    >
                      <td className="px-2 py-1">{m.name}</td>
                      <td className="px-2 py-1">
                        {m.relation || "-"}
                      </td>
                      <td className="px-2 py-1 capitalize">
                        {m.role || "-"}
                      </td>
                      <td className="px-2 py-1">
                        {m.email || "-"}
                      </td>
                      <td className="px-2 py-1">
                        {m.created_at
                          ? formatDateDisplay(m.created_at)
                          : "-"}
                      </td>
                      <td className="px-2 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteMember(m)}
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
    </main>
  );
}
