import { AuthCallbackClient } from "./AuthCallbackClient";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function safeInternalNext(raw: string | null) {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;
  if (v.startsWith("/")) return v;
  return null;
}

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function AuthCallbackPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const code = firstParam(params.code);
  const redirectTo = safeInternalNext(firstParam(params.next)) || "/gastos";

  return <AuthCallbackClient code={code} redirectTo={redirectTo} />;
}
