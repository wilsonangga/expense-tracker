import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ScrollView,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  Alert,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, formatMoney } from "../api";
import type { Expense, Category } from "../types";
import { theme } from "../theme";
import { DateField } from "../components/DateField";
import { ReceiptScanModal } from "../components/ReceiptScanModal";
import { LoadingDots } from "../components/LoadingDots";

const formatAmountInput = (raw: string) => {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("id-ID");
};

const PAGE_SIZE = 50;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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

function prettyDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return {
    weekday: DAY_NAMES[d.getDay()],
    dayMonth: `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`,
    full: `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
  };
}

export function ExpensesScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [view, setView] = useState<"daily" | "category">("daily");
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  // ----- Daily view: paginated (infinite scroll) -----
  const [dailyItems, setDailyItems] = useState<Expense[]>([]);
  const [dailyOffset, setDailyOffset] = useState(0);
  const [dailyTotal, setDailyTotal] = useState(0);
  const [loading, setLoading] = useState(false); // initial load / refresh
  const [loadingMore, setLoadingMore] = useState(false);
  const dailyHasMore = dailyItems.length < dailyTotal;

  // ----- Category view: fetched only for the selected month range -----
  const [catItems, setCatItems] = useState<Expense[]>([]);
  const [catLoading, setCatLoading] = useState(false);

  // month range for the category view ("YYYY-MM" strings, inclusive)
  const thisMonth = new Date().toISOString().slice(0, 7);
  const [rangeFrom, setRangeFrom] = useState(thisMonth);
  const [rangeTo, setRangeTo] = useState(thisMonth);
  const [rangePickerOpen, setRangePickerOpen] = useState(false);

  // form state
  const [editing, setEditing] = useState<Expense | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [category, setCategory] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Initial load: categories + first page of expenses (newest first).
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [page, cats] = await Promise.all([
        api.listExpensesPaged({ limit: PAGE_SIZE, offset: 0 }),
        api.listCategories(),
      ]);
      setDailyItems(page.items);
      setDailyOffset(page.items.length);
      setDailyTotal(page.total);
      setCategories(cats);
      setCategory((cur) => cur || (cats.length ? cats[0].name : ""));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Append the next page when the user scrolls to the bottom.
  const loadMore = useCallback(async () => {
    if (loadingMore || loading) return;
    if (dailyItems.length >= dailyTotal) return;
    setLoadingMore(true);
    try {
      const page = await api.listExpensesPaged({
        limit: PAGE_SIZE,
        offset: dailyOffset,
      });
      setDailyItems((prev) => [...prev, ...page.items]);
      setDailyOffset((o) => o + page.items.length);
      setDailyTotal(page.total);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, loading, dailyItems.length, dailyTotal, dailyOffset]);

  // Category view loads only the selected month range (bounded).
  const loadCategory = useCallback(async () => {
    setCatLoading(true);
    setError(null);
    try {
      const items = await api.listExpenses({
        from: `${rangeFrom}-01`,
        to: `${rangeTo}-31`,
      });
      setCatItems(items);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCatLoading(false);
    }
  }, [rangeFrom, rangeTo]);

  useFocusEffect(
    useCallback(() => {
      load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]),
  );

  // Refetch category data when range or view changes.
  useEffect(() => {
    if (view === "category") loadCategory();
  }, [view, loadCategory]);

  const openAdd = () => {
    setEditing(null);
    setAmount("");
    setNote("");
    setDate(new Date().toISOString().slice(0, 10));
    if (categories.length) setCategory(categories[0].name);
    setModalOpen(true);
  };

  const openEdit = (e: Expense) => {
    setEditing(e);
    setAmount(formatAmountInput(String(e.amount)));
    setNote(e.note);
    setDate(e.date);
    setCategory(e.category);
    setModalOpen(true);
  };

  const submit = async () => {
    const value = Number(amount.replace(/\D/g, ""));
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert("Invalid amount", "Please enter a positive number.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.updateExpense(editing.id, {
          amount: value,
          category,
          note,
          date,
        });
      } else {
        await api.addExpense({ amount: value, category, note, date });
      }
      setModalOpen(false);
      setEditing(null);
      setAmount("");
      setNote("");
      setDate("");
      load();
      if (view === "category") loadCategory();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (e: Expense) => {
    Alert.alert(
      "Delete expense",
      `${formatMoney(e.amount)} — ${e.note || e.category}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await api.deleteExpense(e.id);
              setDailyItems((prev) => prev.filter((x) => x.id !== e.id));
              setCatItems((prev) => prev.filter((x) => x.id !== e.id));
              setDailyTotal((t) => Math.max(0, t - 1));
            } catch (err: any) {
              Alert.alert("Error", err.message);
            }
          },
        },
      ],
    );
  };

  const catIcon = (name: string) =>
    categories.find((c) => c.name === name)?.icon || "📦";
  const catColor = (name: string) =>
    categories.find((c) => c.name === name)?.color || "#6B7280";

  const today = new Date().toISOString().slice(0, 10);
  const todayTotal = useMemo(
    () =>
      dailyItems
        .filter((e) => e.date === today)
        .reduce((s, e) => s + e.amount, 0),
    [dailyItems, today],
  );

  const dayGroups = useMemo(() => {
    const map = new Map<string, { total: number; items: Expense[] }>();
    for (const e of dailyItems) {
      const g = map.get(e.date) || { total: 0, items: [] };
      g.total += e.amount;
      g.items.push(e);
      map.set(e.date, g);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, g]) => ({ date, ...g }));
  }, [dailyItems]);

  const catGroups = useMemo(() => {
    const inRange = catItems;
    const map = new Map<string, { total: number; items: Expense[] }>();
    for (const e of inRange) {
      const g = map.get(e.category) || { total: 0, items: [] };
      g.total += e.amount;
      g.items.push(e);
      map.set(e.category, g);
    }
    const grandTotal = inRange.reduce((s, e) => s + e.amount, 0) || 1;
    return [...map.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([name, g]) => ({ name, ...g, pct: g.total / grandTotal }));
  }, [catItems]);

  const rangeTotal = useMemo(
    () => catGroups.reduce((s, g) => s + g.total, 0),
    [catGroups],
  );

  const shiftMonth = (ym: string, delta: number) => {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  const monthLabel = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    return `${MONTH_NAMES[m - 1]} ${y}`;
  };

  const rangeLabel =
    rangeFrom === rangeTo
      ? monthLabel(rangeFrom)
      : `${monthLabel(rangeFrom)} – ${monthLabel(rangeTo)}`;

  // months listed in the range picker: last 12 months
  const recentMonths = useMemo(() => {
    const arr: string[] = [];
    for (let i = 0; i < 12; i++) arr.push(shiftMonth(thisMonth, -i));
    return arr;
  }, [thisMonth]);

  const renderExpenseRow = (item: Expense, showDate = false) => (
    <Pressable
      key={item.id}
      style={styles.expenseRow}
      onPress={() => openEdit(item)}
      onLongPress={() => confirmDelete(item)}
    >
      <View
        style={[styles.catDot, { backgroundColor: catColor(item.category) }]}
      >
        <Text style={{ fontSize: 14 }}>{catIcon(item.category)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{ color: theme.text, fontWeight: "600" }}
          numberOfLines={1}
        >
          {item.note || item.category}
        </Text>
        <Text style={{ color: theme.textDim, fontSize: 12 }}>
          {item.category}
          {showDate ? ` · ${item.date}` : ""}
          {item.source === "telegram" ? " · 🤖" : ""}
        </Text>
      </View>
      <Text style={{ color: theme.text, fontWeight: "700" }}>
        {formatMoney(item.amount)}
      </Text>
    </Pressable>
  );

  const renderDayCard = (g: {
    date: string;
    total: number;
    items: Expense[];
  }) => {
    const d = prettyDate(g.date);
    const open = expandedDay === g.date;
    return (
      <View style={styles.dayCard}>
        <Pressable
          style={styles.dayHeader}
          onPress={() => setExpandedDay(open ? null : g.date)}
        >
          <View style={styles.dateBadge}>
            <Text style={styles.dateBadgeDay}>{d.weekday}</Text>
            <Text style={styles.dateBadgeDate}>{d.dayMonth}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.textDim, fontSize: 12 }}>
              {g.items.length} transaction{g.items.length > 1 ? "s" : ""}
            </Text>
            <Text style={styles.dayTotal}>{formatMoney(g.total)}</Text>
          </View>
          <Text style={styles.chevron}>{open ? "⌄" : "›"}</Text>
        </Pressable>
        {open && (
          <View style={styles.dayItems}>
            {g.items.map((e) => renderExpenseRow(e))}
          </View>
        )}
      </View>
    );
  };

  const renderCatCard = (g: {
    name: string;
    total: number;
    items: Expense[];
    pct: number;
  }) => {
    const open = expandedCat === g.name;
    return (
      <View style={styles.dayCard}>
        <Pressable
          style={styles.dayHeader}
          onPress={() => setExpandedCat(open ? null : g.name)}
        >
          <View
            style={[styles.catDotLg, { backgroundColor: catColor(g.name) }]}
          >
            <Text style={{ fontSize: 18 }}>{catIcon(g.name)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.catTitleRow}>
              <Text style={{ color: theme.text, fontWeight: "700" }}>
                {g.name}
              </Text>
              <Text style={{ color: theme.text, fontWeight: "700" }}>
                {formatMoney(g.total)}
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.max(g.pct * 100, 2)}%`,
                    backgroundColor: catColor(g.name),
                  },
                ]}
              />
            </View>
            <Text style={{ color: theme.textDim, fontSize: 11 }}>
              {(g.pct * 100).toFixed(1)}% · {g.items.length} transaction
              {g.items.length > 1 ? "s" : ""}
            </Text>
          </View>
          <Text style={styles.chevron}>{open ? "⌄" : "›"}</Text>
        </Pressable>
        {open && (
          <View style={styles.dayItems}>
            {g.items.map((e) => renderExpenseRow(e, true))}
          </View>
        )}
      </View>
    );
  };

  const listHeader = (
    <View>
      {/* Today header card */}
      <View style={styles.todayCard}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.textDim, fontSize: 13 }}>
            Today · {prettyDate(today).full}
          </Text>
          <Text style={styles.todayValue}>{formatMoney(todayTotal)}</Text>
        </View>
        <Pressable style={styles.scanBtn} onPress={load}>
          <Text style={{ color: theme.text, fontWeight: "700" }}>
            {loading ? "⧖" : "🔄"}
          </Text>
        </Pressable>
        <Pressable style={styles.scanBtn} onPress={() => setScanOpen(true)}>
          <Text style={{ color: theme.text, fontWeight: "700" }}>📸</Text>
        </Pressable>
        <Pressable style={styles.addBtn} onPress={openAdd}>
          <Text style={{ color: "#0F172A", fontWeight: "700" }}>＋ Add</Text>
        </Pressable>
      </View>

      {/* View switcher */}
      <View style={styles.segment}>
        {(
          [
            ["daily", "📅 Daily"],
            ["category", "📂 By Category"],
          ] as const
        ).map(([key, label]) => (
          <Pressable
            key={key}
            style={[styles.segmentBtn, view === key && styles.segmentActive]}
            onPress={() => setView(key)}
          >
            <Text
              style={{
                color: view === key ? "#0F172A" : theme.textDim,
                fontWeight: "700",
                fontSize: 13,
              }}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {view === "category" && (
        <View style={styles.monthBar}>
          <Pressable
            style={styles.monthNavBtn}
            onPress={() => {
              const prev =
                rangeFrom === rangeTo ? shiftMonth(rangeFrom, -1) : rangeFrom;
              setRangeFrom(prev);
              setRangeTo(prev);
            }}
          >
            <Text style={styles.monthNavText}>‹</Text>
          </Pressable>
          <Pressable
            style={{ flex: 1, alignItems: "center" }}
            onPress={() => setRangePickerOpen(true)}
          >
            <Text style={{ color: theme.text, fontWeight: "700" }}>
              {rangeLabel}
            </Text>
            <Text style={{ color: theme.textDim, fontSize: 11 }}>
              Total {formatMoney(rangeTotal)} · tap to change range
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.monthNavBtn,
              rangeFrom === rangeTo && rangeTo >= thisMonth && { opacity: 0.3 },
            ]}
            disabled={rangeFrom === rangeTo && rangeTo >= thisMonth}
            onPress={() => {
              const next =
                rangeFrom === rangeTo ? shiftMonth(rangeTo, 1) : rangeTo;
              setRangeFrom(next);
              setRangeTo(next);
            }}
          >
            <Text style={styles.monthNavText}>›</Text>
          </Pressable>
        </View>
      )}

      {view === "daily" && dailyItems.length === 0 && !loading && (
        <Text
          style={{ color: theme.textDim, textAlign: "center", marginTop: 40 }}
        >
          No expenses yet. Add one!
        </Text>
      )}

      {view === "category" && catGroups.length === 0 && !catLoading && (
        <Text
          style={{ color: theme.textDim, textAlign: "center", marginTop: 24 }}
        >
          No expenses in {rangeLabel}.
        </Text>
      )}
    </View>
  );

  const listData: any[] = view === "daily" ? dayGroups : catGroups;

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Expenses</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={listData}
        keyExtractor={(item: any) => (view === "daily" ? item.date : item.name)}
        renderItem={({ item }) =>
          view === "daily" ? renderDayCard(item) : renderCatCard(item)
        }
        ListHeaderComponent={listHeader}
        ListFooterComponent={
          view === "daily" && dailyItems.length > 0 ? (
            loadingMore || dailyHasMore ? (
              <LoadingDots />
            ) : (
              <Text style={styles.endNote}>— end of history —</Text>
            )
          ) : null
        }
        onEndReached={() => {
          if (view === "daily") loadMore();
        }}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={loading || catLoading}
            onRefresh={() => {
              load();
              if (view === "category") loadCategory();
            }}
            tintColor={theme.accent}
          />
        }
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={11}
      />

      <Modal
        visible={modalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalWrap}
        >
          <View style={styles.modal}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.modalTitle}>
                {editing ? "Edit expense" : "Add expense"}
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Amount (e.g. 25.000)"
                placeholderTextColor={theme.textDim}
                keyboardType="numeric"
                value={amount}
                onChangeText={(t) => setAmount(formatAmountInput(t))}
                autoFocus
              />
              <TextInput
                style={styles.input}
                placeholder="Note (optional)"
                placeholderTextColor={theme.textDim}
                value={note}
                onChangeText={setNote}
              />
              <DateField value={date} onChange={setDate} />
              <View style={styles.catWrap}>
                {categories.map((c) => (
                  <Pressable
                    key={c.name}
                    style={[
                      styles.catChip,
                      category === c.name && { backgroundColor: c.color },
                    ]}
                    onPress={() => setCategory(c.name)}
                  >
                    <Text
                      style={{
                        color: category === c.name ? "#fff" : theme.textDim,
                        fontSize: 13,
                      }}
                    >
                      {c.icon} {c.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                <Pressable
                  style={[styles.btn, styles.btnGhost]}
                  onPress={() => setModalOpen(false)}
                >
                  <Text style={{ color: theme.textDim, fontWeight: "600" }}>
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.btn,
                    {
                      backgroundColor: theme.accent,
                      opacity: saving ? 0.6 : 1,
                    },
                  ]}
                  onPress={submit}
                  disabled={saving}
                >
                  <Text style={{ color: "#0F172A", fontWeight: "700" }}>
                    {saving ? "Saving…" : "Save"}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Month range picker */}
      <Modal
        visible={rangePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRangePickerOpen(false)}
      >
        <Pressable
          style={styles.rangeBackdrop}
          onPress={() => setRangePickerOpen(false)}
        >
          <Pressable style={styles.rangeSheet} onPress={() => {}}>
            <Text style={styles.modalTitle}>Select range</Text>
            <Text
              style={{ color: theme.textDim, fontSize: 12, marginBottom: 8 }}
            >
              Tap a month for a single month, or tap two months to set a range.
            </Text>
            {recentMonths.map((ym) => {
              const inRange = ym >= rangeFrom && ym <= rangeTo;
              const isEdge = ym === rangeFrom || ym === rangeTo;
              return (
                <Pressable
                  key={ym}
                  style={[
                    styles.monthOption,
                    inRange && { backgroundColor: theme.cardAlt },
                    isEdge && { backgroundColor: theme.accent },
                  ]}
                  onPress={() => {
                    if (rangeFrom === rangeTo) {
                      // second tap: extend to range
                      if (ym < rangeFrom) {
                        setRangeFrom(ym);
                      } else if (ym > rangeTo) {
                        setRangeTo(ym);
                      } else {
                        setRangePickerOpen(false);
                      }
                    } else {
                      // start a fresh single-month selection
                      setRangeFrom(ym);
                      setRangeTo(ym);
                    }
                  }}
                >
                  <Text
                    style={{
                      color: isEdge ? "#0F172A" : theme.text,
                      fontWeight: isEdge ? "700" : "400",
                    }}
                  >
                    {monthLabel(ym)}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              style={[
                styles.btn,
                { backgroundColor: theme.accent, marginTop: 10 },
              ]}
              onPress={() => setRangePickerOpen(false)}
            >
              <Text style={{ color: "#0F172A", fontWeight: "700" }}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Receipt scanner */}
      <ReceiptScanModal
        visible={scanOpen}
        categories={categories}
        onClose={() => setScanOpen(false)}
        onSaved={() => {
          setScanOpen(false);
          load();
        }}
      />
    </View>
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
  error: { color: theme.danger, marginBottom: 8 },
  todayCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  todayValue: {
    color: theme.text,
    fontSize: 22,
    fontWeight: "800",
    marginTop: 2,
  },
  addBtn: {
    backgroundColor: theme.accent,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  scanBtn: {
    backgroundColor: theme.cardAlt,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginRight: 8,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 9,
  },
  segmentActive: { backgroundColor: theme.accent },
  endNote: {
    color: theme.textDim,
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 18,
  },
  monthBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 8,
    marginBottom: 12,
    gap: 8,
  },
  monthNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  monthNavText: { color: theme.text, fontSize: 20, lineHeight: 22 },
  rangeBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  rangeSheet: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 16,
    width: "100%",
    maxWidth: 340,
  },
  monthOption: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 2,
  },
  dayCard: {
    backgroundColor: theme.card,
    borderRadius: 14,
    marginBottom: 8,
    overflow: "hidden",
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
  },
  dateBadge: {
    backgroundColor: theme.accent,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: "center",
    minWidth: 64,
  },
  dateBadgeDay: { color: "#0F172A", fontSize: 11, fontWeight: "700" },
  dateBadgeDate: { color: "#0F172A", fontSize: 13, fontWeight: "800" },
  dayTotal: { color: theme.text, fontSize: 16, fontWeight: "700" },
  chevron: { color: theme.textDim, fontSize: 20, paddingHorizontal: 4 },
  dayItems: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  expenseRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  catDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  catDotLg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  catTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  progressTrack: {
    height: 6,
    backgroundColor: theme.cardAlt,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 4,
  },
  progressFill: { height: "100%", borderRadius: 3 },
  modalWrap: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modal: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "85%",
  },
  modalTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 14,
  },
  input: {
    backgroundColor: theme.cardAlt,
    borderRadius: 10,
    padding: 12,
    color: theme.text,
    marginBottom: 10,
  },
  catWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: theme.cardAlt,
  },
  btn: { flex: 1, alignItems: "center", padding: 14, borderRadius: 10 },
  btnGhost: { backgroundColor: theme.cardAlt },
});
