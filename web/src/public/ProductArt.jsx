/**
 * Illustration produit vectorielle, déduite de la forme (« visual ») et de la couleur du produit.
 * Sert partout où il n'y a pas de photo : boutique, panier, fiches, cartes.
 */
function shade(hex, amount) {
  const n = parseInt((hex || "#6450FF").replace("#", ""), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}

const SHAPES = {
  bottle: (c) => (
    <>
      <rect x="44" y="10" width="32" height="14" rx="4" fill={shade(c, -50)} />
      <path d="M46 24h28v10c10 6 16 14 16 26v78c0 8-6 14-14 14H44c-8 0-14-6-14-14V60c0-12 6-20 16-26z" fill={c} opacity="0.92" />
      <path d="M30 70h60v40H30z" fill="#fff" opacity="0.9" />
      <rect x="40" y="82" width="40" height="5" rx="2.5" fill={shade(c, -40)} />
      <rect x="46" y="93" width="28" height="4" rx="2" fill={shade(c, -10)} opacity="0.6" />
      <path d="M38 38c-3 6-4 14-4 22v70" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.35" fill="none" />
    </>
  ),
  jug: (c) => (
    <>
      <rect x="48" y="8" width="24" height="12" rx="3" fill={shade(c, -55)} />
      <path d="M50 20h20v10c18 4 30 14 30 30v76c0 9-7 16-16 16H36c-9 0-16-7-16-16V60c0-16 12-26 30-30z" fill={c} opacity="0.85" />
      <path d="M20 84h80M20 112h80" stroke={shade(c, -35)} strokeWidth="4" opacity="0.5" />
      <path d="M30 56c-2 6-3 14-3 22v54" stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity="0.35" fill="none" />
    </>
  ),
  can: (c) => (
    <>
      <ellipse cx="60" cy="28" rx="30" ry="9" fill={shade(c, -60)} />
      <path d="M30 28h60v108c0 5-13 9-30 9s-30-4-30-9z" fill={c} />
      <path d="M30 60h60v42H30z" fill="#fff" opacity="0.92" />
      <circle cx="60" cy="81" r="12" fill={shade(c, -30)} />
      <path d="M40 34v96" stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity="0.3" />
      <ellipse cx="60" cy="28" rx="22" ry="5" fill={shade(c, 40)} opacity="0.6" />
    </>
  ),
  sachet: (c) => (
    <>
      <path d="M22 34c12-8 64-8 76 0l-6 98c-12 10-52 10-64 0z" fill={c} opacity="0.75" />
      <path d="M22 34c12-8 64-8 76 0" stroke={shade(c, -40)} strokeWidth="5" fill="none" strokeLinecap="round" />
      <rect x="34" y="70" width="52" height="28" rx="6" fill="#fff" opacity="0.85" />
      <rect x="42" y="80" width="36" height="5" rx="2.5" fill={shade(c, -40)} />
    </>
  ),
  box: (c) => (
    <>
      <path d="M14 58l46-20 46 20-46 20z" fill={shade(c, 40)} />
      <path d="M14 58v62l46 22V78z" fill={c} />
      <path d="M106 58v62l-46 22V78z" fill={shade(c, -35)} />
      <ellipse cx="60" cy="58" rx="16" ry="6" fill={shade(c, -60)} />
      <path d="M50 58c-4-16 6-30 14-32 4 8-2 18 6 30z" fill="#fff" />
      <path d="M24 96l26 12M24 106l26 12" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity="0.7" />
    </>
  ),
  roll: (c) => (
    <>
      {[[18, 56], [62, 56], [40, 92]].map(([x, y], i) => (
        <g key={i}>
          <rect x={x} y={y} width="40" height="44" rx="6" fill="#fff" stroke={shade(c, -10)} strokeWidth="2" />
          <ellipse cx={x + 20} cy={y} rx="20" ry="7" fill="#F4F2FF" stroke={shade(c, -10)} strokeWidth="2" />
          <ellipse cx={x + 20} cy={y} rx="6" ry="2.5" fill={shade(c, -30)} />
        </g>
      ))}
      <path d="M12 74h96v16H12z" fill={c} opacity="0.85" />
    </>
  ),
  pack: (c) => (
    <>
      <path d="M16 46l44-18 44 18-44 18z" fill={shade(c, 35)} />
      <path d="M16 46v74l44 20V64z" fill={c} />
      <path d="M104 46v74l-44 20V64z" fill={shade(c, -30)} />
      <path d="M28 80l22 10" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.85" />
      <path d="M28 92l14 6" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity="0.6" />
    </>
  ),
  sack: (c) => (
    <>
      <path d="M30 30c10 6 50 6 60 0l8 22c6 24 6 58-2 82-12 10-60 10-72 0-8-24-8-58-2-82z" fill={c} />
      <path d="M30 30c10 6 50 6 60 0" stroke={shade(c, -40)} strokeWidth="5" fill="none" />
      <rect x="36" y="70" width="48" height="34" rx="8" fill="#fff" opacity="0.88" />
      <rect x="44" y="82" width="32" height="5" rx="2.5" fill={shade(c, -50)} />
    </>
  ),
  jar: (c) => (
    <>
      <rect x="50" y="8" width="8" height="18" rx="3" fill={shade(c, -50)} />
      <path d="M44 22h36v8H44z" fill={shade(c, -50)} />
      <rect x="40" y="30" width="44" height="16" rx="5" fill={shade(c, -30)} />
      <rect x="32" y="46" width="60" height="96" rx="16" fill={c} opacity="0.9" />
      <rect x="40" y="74" width="44" height="34" rx="6" fill="#fff" opacity="0.9" />
      <path d="M40 54v80" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.35" />
    </>
  ),
  bar: (c) => (
    <>
      <path d="M16 78c0-14 12-22 44-22s44 8 44 22v20c0 14-12 22-44 22S16 112 16 98z" fill={c} />
      <ellipse cx="60" cy="78" rx="44" ry="20" fill={shade(c, 30)} />
      <ellipse cx="60" cy="78" rx="26" ry="9" fill="#fff" opacity="0.5" />
    </>
  ),
};

export default function ProductArt({ visual = "pack", accent = "#6450FF", size = 120, bg = true, className = "" }) {
  const draw = SHAPES[visual] || SHAPES.pack;
  return (
    <svg className={className} width={size} height={size * 1.25} viewBox="0 0 120 150" role="img" aria-hidden="true">
      {bg && <ellipse cx="60" cy="144" rx="42" ry="5" fill="#14123A" opacity="0.12" />}
      {draw(accent)}
    </svg>
  );
}
