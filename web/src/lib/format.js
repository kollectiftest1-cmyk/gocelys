const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export function money(value, currency = "CDF") {
  const n = Number(value || 0);
  if (currency === "USD") return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n)} $`;
  return `${nf.format(n)} FC`;
}

/** Montant compact pour les grands nombres : 4,3 M FC */
export function moneyShort(value, currency = "CDF") {
  const n = Number(value || 0);
  const suffix = currency === "USD" ? " $" : " FC";
  if (Math.abs(n) >= 1e9) return `${nf1.format(n / 1e9)} Md${suffix}`;
  if (Math.abs(n) >= 1e6) return `${nf1.format(n / 1e6)} M${suffix}`;
  if (Math.abs(n) >= 1e4) return `${nf.format(n / 1e3)} k${suffix}`;
  return money(n, currency);
}

export function qty(value, unit) {
  const n = Number(value || 0);
  const s = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n);
  return unit ? `${s} ${unit.toLowerCase()}${Math.abs(n) > 1 && !unit.endsWith("s") ? "s" : ""}` : s;
}

export function num(value, digits = 0) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(Number(value || 0));
}

export function pct(value) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  return `${n > 0 ? "+" : ""}${nf1.format(n)} %`;
}

export function date(value, opts = {}) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: opts.year ? "numeric" : undefined });
}

export function dateLong(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function datetime(value) {
  if (!value) return "—";
  const d = new Date(value);
  return `${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} · ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function time(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function ago(value) {
  if (!value) return "—";
  const s = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 7) return `il y a ${Math.floor(s / 86400)} j`;
  return date(value);
}

export function initials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

export function isoDate(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
