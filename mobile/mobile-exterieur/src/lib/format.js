const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

export const num = (v, d = 0) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: d }).format(Number(v || 0)).replace(/ /g, " ");
export const money = (v, currency = "CDF") =>
  currency === "USD" ? `${num(v, 2)} $` : `${nf.format(Math.round(Number(v || 0))).replace(/ /g, " ")} FC`;
export const time = (v) => (v ? new Date(v).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—");
export const datetime = (v) => (v ? `${new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} · ${time(v)}` : "—");
export const ago = (v) => {
  if (!v) return "—";
  const s = Math.round((Date.now() - new Date(v).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
};
export const initials = (name = "") => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
