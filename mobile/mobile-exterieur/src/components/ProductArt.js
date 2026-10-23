import { Image, View } from "react-native";
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";

import { colors } from "../lib/theme";

/**
 * Illustration produit vectorielle (mêmes formes que le site web), déduite du champ « visual »
 * et de la couleur du produit. Aucune image n'est nécessaire.
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
      <Rect x="44" y="10" width="32" height="14" rx="4" fill={shade(c, -50)} />
      <Path d="M46 24h28v10c10 6 16 14 16 26v78c0 8-6 14-14 14H44c-8 0-14-6-14-14V60c0-12 6-20 16-26z" fill={c} opacity="0.92" />
      <Path d="M30 70h60v40H30z" fill="#fff" opacity="0.9" />
      <Rect x="40" y="82" width="40" height="5" rx="2.5" fill={shade(c, -40)} />
      <Rect x="46" y="93" width="28" height="4" rx="2" fill={shade(c, -10)} opacity="0.6" />
      <Path d="M38 38c-3 6-4 14-4 22v70" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.35" fill="none" />
    </>
  ),
  jug: (c) => (
    <>
      <Rect x="48" y="8" width="24" height="12" rx="3" fill={shade(c, -55)} />
      <Path d="M50 20h20v10c18 4 30 14 30 30v76c0 9-7 16-16 16H36c-9 0-16-7-16-16V60c0-16 12-26 30-30z" fill={c} opacity="0.85" />
      <Path d="M20 84h80M20 112h80" stroke={shade(c, -35)} strokeWidth="4" opacity="0.5" />
      <Path d="M30 56c-2 6-3 14-3 22v54" stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity="0.35" fill="none" />
    </>
  ),
  can: (c) => (
    <>
      <Ellipse cx="60" cy="28" rx="30" ry="9" fill={shade(c, -60)} />
      <Path d="M30 28h60v108c0 5-13 9-30 9s-30-4-30-9z" fill={c} />
      <Path d="M30 60h60v42H30z" fill="#fff" opacity="0.92" />
      <Circle cx="60" cy="81" r="12" fill={shade(c, -30)} />
      <Path d="M40 34v96" stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity="0.3" />
      <Ellipse cx="60" cy="28" rx="22" ry="5" fill={shade(c, 40)} opacity="0.6" />
    </>
  ),
  sachet: (c) => (
    <>
      <Path d="M22 34c12-8 64-8 76 0l-6 98c-12 10-52 10-64 0z" fill={c} opacity="0.75" />
      <Path d="M22 34c12-8 64-8 76 0" stroke={shade(c, -40)} strokeWidth="5" fill="none" strokeLinecap="round" />
      <Rect x="34" y="70" width="52" height="28" rx="6" fill="#fff" opacity="0.85" />
      <Rect x="42" y="80" width="36" height="5" rx="2.5" fill={shade(c, -40)} />
    </>
  ),
  box: (c) => (
    <>
      <Path d="M14 58l46-20 46 20-46 20z" fill={shade(c, 40)} />
      <Path d="M14 58v62l46 22V78z" fill={c} />
      <Path d="M106 58v62l-46 22V78z" fill={shade(c, -35)} />
      <Ellipse cx="60" cy="58" rx="16" ry="6" fill={shade(c, -60)} />
      <Path d="M50 58c-4-16 6-30 14-32 4 8-2 18 6 30z" fill="#fff" />
      <Path d="M24 96l26 12M24 106l26 12" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity="0.7" />
    </>
  ),
  roll: (c) => (
    <>
      {[[18, 56], [62, 56], [40, 92]].map(([x, y], i) => (
        <G key={i}>
          <Rect x={x} y={y} width="40" height="44" rx="6" fill="#fff" stroke={shade(c, -10)} strokeWidth="2" />
          <Ellipse cx={x + 20} cy={y} rx="20" ry="7" fill="#F4F2FF" stroke={shade(c, -10)} strokeWidth="2" />
          <Ellipse cx={x + 20} cy={y} rx="6" ry="2.5" fill={shade(c, -30)} />
        </G>
      ))}
      <Path d="M12 74h96v16H12z" fill={c} opacity="0.85" />
    </>
  ),
  pack: (c) => (
    <>
      <Path d="M16 46l44-18 44 18-44 18z" fill={shade(c, 35)} />
      <Path d="M16 46v74l44 20V64z" fill={c} />
      <Path d="M104 46v74l-44 20V64z" fill={shade(c, -30)} />
      <Path d="M28 80l22 10" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.85" />
      <Path d="M28 92l14 6" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity="0.6" />
    </>
  ),
  sack: (c) => (
    <>
      <Path d="M30 30c10 6 50 6 60 0l8 22c6 24 6 58-2 82-12 10-60 10-72 0-8-24-8-58-2-82z" fill={c} />
      <Path d="M30 30c10 6 50 6 60 0" stroke={shade(c, -40)} strokeWidth="5" fill="none" />
      <Rect x="36" y="70" width="48" height="34" rx="8" fill="#fff" opacity="0.88" />
      <Rect x="44" y="82" width="32" height="5" rx="2.5" fill={shade(c, -50)} />
    </>
  ),
  jar: (c) => (
    <>
      <Rect x="50" y="8" width="8" height="18" rx="3" fill={shade(c, -50)} />
      <Path d="M44 22h36v8H44z" fill={shade(c, -50)} />
      <Rect x="40" y="30" width="44" height="16" rx="5" fill={shade(c, -30)} />
      <Rect x="32" y="46" width="60" height="96" rx="16" fill={c} opacity="0.9" />
      <Rect x="40" y="74" width="44" height="34" rx="6" fill="#fff" opacity="0.9" />
      <Path d="M40 54v80" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.35" />
    </>
  ),
  bar: (c) => (
    <>
      <Path d="M16 78c0-14 12-22 44-22s44 8 44 22v20c0 14-12 22-44 22S16 112 16 98z" fill={c} />
      <Ellipse cx="60" cy="78" rx="44" ry="20" fill={shade(c, 30)} />
      <Ellipse cx="60" cy="78" rx="26" ry="9" fill="#fff" opacity="0.5" />
    </>
  ),
};

function guess(unit = "") {
  const u = unit.toLowerCase();
  if (u.includes("bidon")) return "jug";
  if (u.includes("bouteille") || u.includes("flacon")) return "bottle";
  if (u.includes("sachet")) return "sachet";
  if (u.includes("canette")) return "can";
  if (u.includes("sac")) return "sack";
  if (u.includes("rouleau")) return "roll";
  return "pack";
}

export default function ProductArt({ visual, accent = colors.brand500 || "#6450FF", unit = "", size = 64, tile = true, image, cutout }) {
  if (image) {
    // photo du produit : détourée → posée sur la teinte du produit ; fond plein → plein cadre
    return (
      <View style={{ width: size, height: size, borderRadius: size * 0.27, overflow: "hidden", backgroundColor: tile ? `${accent}24` : "transparent", alignItems: "center", justifyContent: "center" }}>
        <Image source={{ uri: image }} accessibilityIgnoresInvertColors
          style={cutout ? { width: size * 0.84, height: size * 0.84 } : { width: size, height: size }}
          resizeMode={cutout ? "contain" : "cover"} />
      </View>
    );
  }
  const draw = SHAPES[visual] || SHAPES[guess(unit)];
  return (
    <Svg width={size} height={size} viewBox="-15 0 150 150">
      {tile && <Rect x="-15" y="0" width="150" height="150" rx="40" fill={accent} opacity="0.14" />}
      <G transform="translate(12 12) scale(0.8)">{draw(accent)}</G>
    </Svg>
  );
}
