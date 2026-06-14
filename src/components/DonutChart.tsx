import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Path, Circle, G } from "react-native-svg";
import { theme } from "../theme";
import { formatMoney } from "../api";

export interface Slice {
  label: string;
  value: number;
  color: string;
  icon?: string;
}

interface Props {
  slices: Slice[];
  selected: string | null;
  onSelect: (label: string | null) => void;
  size?: number;
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  // Full circle edge case
  if (endAngle - startAngle >= 2 * Math.PI - 0.001) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r}`;
  }
  const x1 = cx + r * Math.sin(startAngle);
  const y1 = cy - r * Math.cos(startAngle);
  const x2 = cx + r * Math.sin(endAngle);
  const y2 = cy - r * Math.cos(endAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

export function DonutChart({ slices, selected, onSelect, size = 220 }: Props) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 24;
  const stroke = 30;

  if (!total) {
    return (
      <View style={[styles.empty, { height: size }]}>
        <Text style={{ color: theme.textDim }}>No data yet</Text>
      </View>
    );
  }

  let angle = 0;
  const arcs = slices.map((s) => {
    const start = angle;
    const sweep = (s.value / total) * 2 * Math.PI;
    angle += sweep;
    return { ...s, start, end: angle, sweep };
  });

  const active = selected ? arcs.find((a) => a.label === selected) : null;

  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={size} height={size}>
        <G>
          {arcs.map((a) => (
            <Path
              key={a.label}
              d={arcPath(cx, cy, r, a.start + 0.02, a.end - 0.02)}
              stroke={a.color}
              strokeWidth={selected === a.label ? stroke + 8 : stroke}
              strokeOpacity={selected && selected !== a.label ? 0.35 : 1}
              fill="none"
              strokeLinecap="butt"
              onPress={() => onSelect(selected === a.label ? null : a.label)}
            />
          ))}
          <Circle
            cx={cx}
            cy={cy}
            r={r - stroke}
            fill="transparent"
            onPress={() => onSelect(null)}
          />
        </G>
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={styles.centerLabel}>
          {active ? `${active.icon ?? ""} ${active.label}` : "Total"}
        </Text>
        <Text style={styles.centerValue}>
          {formatMoney(active ? active.value : total)}
        </Text>
        {active && (
          <Text style={styles.centerPct}>
            {((active.value / total) * 100).toFixed(1)}%
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", justifyContent: "center" },
  center: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  centerLabel: { color: theme.textDim, fontSize: 13 },
  centerValue: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "700",
    marginTop: 2,
  },
  centerPct: { color: theme.accent, fontSize: 13, marginTop: 2 },
});
