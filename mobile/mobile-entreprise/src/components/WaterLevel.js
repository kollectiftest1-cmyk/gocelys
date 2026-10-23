import Svg, { ClipPath, Defs, G, Line, Path, Rect } from "react-native-svg";

import { colors } from "../lib/theme";

/** Jauge « niveau d'eau » : signature visuelle Gocelsys, identique au web. */
export default function WaterLevel({ value = 0, min = 0, max = 0, width = 20, height = 44 }) {
  const cap = Math.max(max, min * 2, value, 1);
  const ratio = Math.max(0, Math.min(1, value / cap));
  const minRatio = Math.max(0, Math.min(1, min / cap));
  const tone = value <= 0 ? colors.clay500 : value <= min ? colors.amber500 : colors.sky500;
  const fillH = Math.max(value > 0 ? 3 : 0, ratio * (height - 4));
  const y = height - 2 - fillH;
  const id = `c${width}${height}`;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <ClipPath id={id}>
          <Rect x="1" y="1" width={width - 2} height={height - 2} rx={width / 3.2} />
        </ClipPath>
      </Defs>
      <Rect x="1" y="1" width={width - 2} height={height - 2} rx={width / 3.2} fill="#F0F0F7" stroke={colors.lineStrong} />
      <G clipPath={`url(#${id})`}>
        <Rect x="0" y={y + 2} width={width} height={fillH + 2} fill={tone} />
        <Path d={`M0 ${y + 2} Q ${width / 4} ${y - 0.6} ${width / 2} ${y + 2} T ${width} ${y + 2} V ${y + 5} H 0 Z`} fill={tone} />
      </G>
      {min > 0 && (
        <Line x1="3" x2={width - 3} y1={height - 2 - minRatio * (height - 4)} y2={height - 2 - minRatio * (height - 4)} stroke={colors.night800} strokeWidth="1" strokeDasharray="2 2" opacity="0.55" />
      )}
    </Svg>
  );
}
