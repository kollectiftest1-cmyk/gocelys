/**
 * Jauge « niveau d'eau » : l'élément signature de Gocelsys.
 * Le remplissage représente le stock disponible par rapport au stock maximum ;
 * la ligne pointillée marque le seuil minimum. La couleur passe au rouge sous le seuil.
 */
export function WaterLevel({ value = 0, min = 0, max = 0, height = 44, width = 22, showMin = true }) {
  const cap = Math.max(max, min * 2, value, 1);
  const ratio = Math.max(0, Math.min(1, value / cap));
  const minRatio = Math.max(0, Math.min(1, min / cap));
  const tone = value <= 0 ? "#E5484D" : value <= min ? "#F2A01F" : "#22C3E6";
  const deep = value <= 0 ? "#C9363E" : value <= min ? "#A86A00" : "#4B35E0";
  const fillH = Math.max(value > 0 ? 3 : 0, ratio * (height - 4));
  const y = height - 2 - fillH;
  const id = `w${Math.round(ratio * 1000)}-${Math.round(minRatio * 1000)}-${height}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={`Niveau ${Math.round(ratio * 100)} %`} style={{ flex: "none", display: "block" }}>
      <defs>
        <clipPath id={id}>
          <rect x="1" y="1" width={width - 2} height={height - 2} rx={width / 3.2} />
        </clipPath>
      </defs>
      <rect x="1" y="1" width={width - 2} height={height - 2} rx={width / 3.2} fill="#F0F0F7" stroke="#DCDCE8" />
      <g clipPath={`url(#${id})`}>
        <rect x="0" y={y + 2} width={width} height={fillH + 2} fill={tone} />
        <path d={`M0 ${y + 2} Q ${width / 4} ${y - 0.6} ${width / 2} ${y + 2} T ${width} ${y + 2} V ${y + 5} H 0 Z`} fill={tone} />
        <rect x="0" y={height - 2 - fillH * 0.38} width={width} height={fillH * 0.38 + 2} fill={deep} opacity="0.22" />
      </g>
      {showMin && min > 0 && (
        <line x1="3" x2={width - 3} y1={height - 2 - minRatio * (height - 4)} y2={height - 2 - minRatio * (height - 4)}
          stroke="#14123A" strokeWidth="1" strokeDasharray="2 2" opacity="0.55" />
      )}
    </svg>
  );
}

/** Barre horizontale de niveau, pour les listes denses. */
export function LevelBar({ value = 0, min = 0, max = 0 }) {
  const cap = Math.max(max, min * 2, value, 1);
  const ratio = Math.max(0, Math.min(1, value / cap));
  const minRatio = Math.max(0, Math.min(1, min / cap));
  const tone = value <= 0 ? "var(--clay-500)" : value <= min ? "var(--amber-500)" : "var(--sky-500)";
  return (
    <div style={{ position: "relative", height: 8, borderRadius: 4, background: "var(--mist-100)", minWidth: 80 }}>
      <div style={{ position: "absolute", inset: 0, width: `${ratio * 100}%`, background: tone, borderRadius: 4 }} />
      {min > 0 && (
        <div style={{ position: "absolute", top: -3, bottom: -3, left: `${minRatio * 100}%`, width: 2, background: "var(--night-700)", opacity: 0.5, borderRadius: 1 }} />
      )}
    </div>
  );
}
