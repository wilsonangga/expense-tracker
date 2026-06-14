import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal } from "react-native";
import { theme } from "../theme";

const DAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (y: number, m: number, d: number) =>
  `${y}-${pad(m + 1)}-${pad(d)}`;

interface Props {
  value: string; // YYYY-MM-DD
  onChange: (iso: string) => void;
}

export function DateField({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  const parsed = useMemo(() => {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) {
      const now = new Date();
      return { y: now.getFullYear(), mo: now.getMonth(), d: now.getDate() };
    }
    return { y: Number(m[1]), mo: Number(m[2]) - 1, d: Number(m[3]) };
  }, [value]);

  const [viewYear, setViewYear] = useState(parsed.y);
  const [viewMonth, setViewMonth] = useState(parsed.mo);

  const openPicker = () => {
    setViewYear(parsed.y);
    setViewMonth(parsed.mo);
    setOpen(true);
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  };

  const weeks = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (number | null)[] = [
      ...Array(firstDay).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [viewYear, viewMonth]);

  const todayISO = new Date().toISOString().slice(0, 10);

  const display = useMemo(() => {
    const d = new Date(`${value}T00:00:00`);
    if (isNaN(d.getTime())) return value;
    return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  }, [value]);

  return (
    <>
      <Pressable style={styles.field} onPress={openPicker}>
        <Text style={{ color: theme.text }}>📅 {display}</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.calendar} onPress={() => {}}>
            <View style={styles.headerRow}>
              <Pressable style={styles.navBtn} onPress={prevMonth}>
                <Text style={styles.navText}>‹</Text>
              </Pressable>
              <Text style={styles.headerTitle}>
                {MONTH_NAMES[viewMonth]} {viewYear}
              </Text>
              <Pressable style={styles.navBtn} onPress={nextMonth}>
                <Text style={styles.navText}>›</Text>
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {DAY_HEADERS.map((d) => (
                <Text key={d} style={styles.weekHeader}>
                  {d}
                </Text>
              ))}
            </View>

            {weeks.map((week, wi) => (
              <View key={wi} style={styles.weekRow}>
                {week.map((day, di) => {
                  if (day === null)
                    return <View key={di} style={styles.dayCell} />;
                  const iso = toISO(viewYear, viewMonth, day);
                  const isSelected = iso === value;
                  const isToday = iso === todayISO;
                  return (
                    <Pressable
                      key={di}
                      style={[
                        styles.dayCell,
                        isSelected && styles.daySelected,
                        !isSelected && isToday && styles.dayToday,
                      ]}
                      onPress={() => {
                        onChange(iso);
                        setOpen(false);
                      }}
                    >
                      <Text
                        style={{
                          color: isSelected
                            ? "#0F172A"
                            : isToday
                              ? theme.accent
                              : theme.text,
                          fontWeight: isSelected || isToday ? "700" : "400",
                        }}
                      >
                        {day}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}

            <Pressable
              style={styles.todayBtn}
              onPress={() => {
                onChange(todayISO);
                setOpen(false);
              }}
            >
              <Text style={{ color: theme.accent, fontWeight: "700" }}>
                Today
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    backgroundColor: theme.cardAlt,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  calendar: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 16,
    width: "100%",
    maxWidth: 340,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headerTitle: { color: theme.text, fontWeight: "700", fontSize: 16 },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  navText: { color: theme.text, fontSize: 20, lineHeight: 22 },
  weekRow: { flexDirection: "row" },
  weekHeader: {
    flex: 1,
    textAlign: "center",
    color: theme.textDim,
    fontSize: 12,
    paddingVertical: 6,
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    margin: 1,
  },
  daySelected: { backgroundColor: theme.accent },
  dayToday: { borderWidth: 1, borderColor: theme.accent },
  todayBtn: { alignItems: "center", paddingTop: 12 },
});
