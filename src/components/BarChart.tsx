import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { theme } from "../theme";
import { formatMoney } from "../api";

export interface Bar {
  label: string; // short label shown under the bar
  fullLabel: string; // shown when selected
  value: number;
}

interface Props {
  bars: Bar[];
  selected: string | null;
  onSelect: (label: string | null) => void;
  height?: number;
}

export function BarChart({ bars, selected, onSelect, height = 140 }: Props) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  const active = selected ? bars.find((b) => b.label === selected) : null;

  return (
    <View>
      <View style={styles.tooltip}>
        <Text
          style={{ color: active ? theme.text : theme.textDim, fontSize: 13 }}
        >
          {active
            ? `${active.fullLabel}: ${formatMoney(active.value)}`
            : "Tap a bar for details"}
        </Text>
      </View>
      <View style={[styles.row, { height }]}>
        {bars.map((b) => (
          <Pressable
            key={b.label}
            style={styles.barWrap}
            onPress={() => onSelect(selected === b.label ? null : b.label)}
          >
            <View
              style={{
                height: Math.max(
                  (b.value / max) * (height - 24),
                  b.value > 0 ? 4 : 1,
                ),
                backgroundColor:
                  selected === b.label ? theme.accent : theme.cardAlt,
                borderRadius: 4,
                width: "70%",
              }}
            />
            <Text style={styles.barLabel} numberOfLines={1}>
              {b.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tooltip: { alignItems: "center", marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "flex-end" },
  barWrap: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  barLabel: { color: theme.textDim, fontSize: 10, marginTop: 4 },
});
