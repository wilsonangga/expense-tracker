import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Pressable,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, formatMoney } from "../api";
import type { Expense, Category } from "../types";
import { DonutChart } from "../components/DonutChart";
import { BarChart } from "../components/BarChart";
import { theme } from "../theme";

type Range = "7d" | "30d" | "month";

const isoDaysAgo = (n: number) =>
  new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const dayMonth = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
};

export function DashboardScreen() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [range, setRange] = useState<Range>("month");
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const from =
        range === "7d"
          ? isoDaysAgo(6)
          : range === "30d"
            ? isoDaysAgo(29)
            : new Date().toISOString().slice(0, 8) + "01";
      const [exp, cats] = await Promise.all([
        api.listExpenses({ from }),
        api.listCategories(),
      ]);
      setExpenses(exp);
      setCategories(cats);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filtered = useMemo(
    () =>
      selectedCat
        ? expenses.filter((e) => e.category === selectedCat)
        : expenses,
    [expenses, selectedCat],
  );

  const total = useMemo(
    () => filtered.reduce((s, e) => s + e.amount, 0),
    [filtered],
  );
  const avgPerDay = useMemo(() => {
    const days =
      range === "7d" ? 7 : range === "30d" ? 30 : new Date().getDate();
    return total / days;
  }, [total, range]);

  const slices = useMemo(() => {
    const byCat = new Map<string, number>();
    for (const e of expenses)
      byCat.set(e.category, (byCat.get(e.category) || 0) + e.amount);
    return [...byCat.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => {
        const cat = categories.find((c) => c.name === label);
        return {
          label,
          value,
          color: cat?.color || "#6B7280",
          icon: cat?.icon,
        };
      });
  }, [expenses, categories]);

  const bars = useMemo(() => {
    const days = range === "7d" ? 7 : range === "30d" ? 14 : 14; // cap bars for readability
    const byDay = new Map<string, number>();
    for (const e of filtered)
      byDay.set(e.date, (byDay.get(e.date) || 0) + e.amount);
    return Array.from({ length: days }, (_, i) => {
      const date = isoDaysAgo(days - 1 - i);
      return {
        label: date.slice(8),
        fullLabel: date,
        value: byDay.get(date) || 0,
      };
    });
  }, [filtered, range]);

  const topExpenses = useMemo(() => filtered.slice(0, 5), [filtered]);

  return (
    <ScrollView
      style={styles.screen}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={load}
          tintColor={theme.accent}
        />
      }
    >
      <Text style={styles.title}>Dashboard</Text>

      <View style={styles.rangeRow}>
        {(["7d", "30d", "month"] as Range[]).map((r) => (
          <Pressable
            key={r}
            onPress={() => setRange(r)}
            style={[styles.rangeBtn, range === r && styles.rangeBtnActive]}
          >
            <Text
              style={{
                color: range === r ? "#0F172A" : theme.textDim,
                fontWeight: "600",
              }}
            >
              {r === "7d" ? "7 days" : r === "30d" ? "30 days" : "This month"}
            </Text>
          </Pressable>
        ))}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>
            {selectedCat ? selectedCat : "Total spent"}
          </Text>
          <Text style={styles.statValue}>{formatMoney(total)}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Avg / day</Text>
          <Text style={styles.statValue}>
            {formatMoney(Math.round(avgPerDay))}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          By category {selectedCat ? "· tap again to clear" : "· tap a slice"}
        </Text>
        <DonutChart
          slices={slices}
          selected={selectedCat}
          onSelect={setSelectedCat}
        />
        <View style={styles.legend}>
          {slices.map((s) => (
            <Pressable
              key={s.label}
              style={styles.legendItem}
              onPress={() =>
                setSelectedCat(selectedCat === s.label ? null : s.label)
              }
            >
              <View style={[styles.legendDot, { backgroundColor: s.color }]} />
              <Text
                style={{
                  color: selectedCat === s.label ? theme.text : theme.textDim,
                  fontSize: 12,
                }}
              >
                {s.icon} {s.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          Daily spending{selectedCat ? ` · ${selectedCat}` : ""}
        </Text>
        <BarChart
          bars={bars}
          selected={selectedDay}
          onSelect={setSelectedDay}
        />
      </View>

      <View style={[styles.card, { marginBottom: 32 }]}>
        <Text style={styles.cardTitle}>
          Recent{selectedCat ? ` · ${selectedCat}` : ""}
        </Text>
        {topExpenses.length === 0 && (
          <Text style={{ color: theme.textDim }}>
            No expenses in this range.
          </Text>
        )}
        {topExpenses.map((e) => (
          <View key={e.id} style={styles.expenseRow}>
            <Text style={{ color: theme.text, flex: 1 }} numberOfLines={1}>
              {categories.find((c) => c.name === e.category)?.icon}{" "}
              {e.note || e.category}
            </Text>
            <Text
              style={{ color: theme.textDim, marginRight: 8, fontSize: 12 }}
            >
              {dayMonth(e.date)}
            </Text>
            <Text style={{ color: theme.text, fontWeight: "600" }}>
              {formatMoney(e.amount)}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg, padding: 16 },
  title: {
    color: theme.text,
    fontSize: 24,
    fontWeight: "800",
    marginTop: 40,
    marginBottom: 12,
  },
  rangeRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  rangeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: theme.card,
  },
  rangeBtnActive: { backgroundColor: theme.accent },
  error: { color: theme.danger, marginBottom: 8 },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  statCard: {
    flex: 1,
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 14,
  },
  statLabel: { color: theme.textDim, fontSize: 12 },
  statValue: {
    color: theme.text,
    fontSize: 17,
    fontWeight: "700",
    marginTop: 4,
  },
  card: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: { color: theme.textDim, fontSize: 13, marginBottom: 10 },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 10,
    justifyContent: "center",
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  expenseRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
  },
});
