export function formatMoney(num: number, currency: string = "MXN") {
  const safe = Number.isFinite(num) ? num : 0;
  return safe.toLocaleString("es-MX", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  });
}

export function formatDateDisplay(ymd?: string | null) {
  if (!ymd) return "";
  const s = ymd.slice(0, 10);
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

export function toNumberSafe(input: string) {
  // soporta "12,345.67" y "12345.67"
  const raw = (input ?? "").toString().replace(/\s/g, "").replace(/,/g, "");
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}
