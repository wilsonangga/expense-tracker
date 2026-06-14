import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { api, formatMoney } from "../api";
import type { Receipt, Category } from "../types";
import { theme } from "../theme";

interface Props {
  visible: boolean;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}

type Phase = "pick" | "scanning" | "select" | "saving";

export function ReceiptScanModal({
  visible,
  categories,
  onClose,
  onSaved,
}: Props) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  // selected[i] = how many units of item i belong to the user (0..qty)
  const [selected, setSelected] = useState<number[]>([]);
  const [category, setCategory] = useState<string>("");

  const reset = () => {
    setPhase("pick");
    setReceipt(null);
    setSelected([]);
  };

  const close = () => {
    reset();
    onClose();
  };

  const pickImage = async (fromCamera: boolean) => {
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ["images"],
      quality: 0.7,
      base64: true,
    };
    const result = fromCamera
      ? await (async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            Alert.alert("Permission needed", "Camera access was denied.");
            return null;
          }
          return ImagePicker.launchCameraAsync(options);
        })()
      : await ImagePicker.launchImageLibraryAsync(options);

    if (!result || result.canceled || !result.assets?.[0]?.base64) return;

    setPhase("scanning");
    try {
      const asset = result.assets[0];
      const scanned = await api.scanReceipt(
        asset.base64!,
        asset.mimeType || "image/jpeg",
      );
      setReceipt(scanned);
      setSelected(scanned.items.map((it) => it.qty));
      setCategory(
        categories.find((c) => c.name === "Food")?.name ||
          categories[0]?.name ||
          "",
      );
      setPhase("select");
    } catch (e: any) {
      Alert.alert("Scan failed", e.message);
      setPhase("pick");
    }
  };

  const setQty = (i: number, qty: number) => {
    setSelected((prev) => {
      const next = [...prev];
      next[i] = Math.max(0, Math.min(qty, receipt?.items[i]?.qty ?? 0));
      return next;
    });
  };

  const toggle = (i: number) => {
    if (!receipt) return;
    setQty(i, selected[i] > 0 ? 0 : receipt.items[i].qty);
  };

  const selCount = useMemo(
    () => selected.reduce((s, q) => s + q, 0),
    [selected],
  );

  const yourShare = useMemo(() => {
    if (!receipt) return 0;
    const itemsSubtotal = receipt.items.reduce((s, it) => s + it.price, 0) || 1;
    const selSubtotal = receipt.items.reduce(
      (s, it, i) => s + (it.price / it.qty) * (selected[i] || 0),
      0,
    );
    const share = selSubtotal / itemsSubtotal;
    const fees = receipt.serviceFee + receipt.tax - receipt.discount;
    return Math.round(selSubtotal + share * fees);
  }, [receipt, selected]);

  const save = async () => {
    if (!receipt || selCount === 0) {
      Alert.alert("Nothing selected", "Select at least one item.");
      return;
    }
    setPhase("saving");
    try {
      const itemNames = receipt.items
        .map((it, i) =>
          selected[i] > 0
            ? `${it.name}${it.qty > 1 ? ` ×${selected[i]}` : ""}`
            : null,
        )
        .filter(Boolean)
        .join(", ");
      const note =
        `${receipt.merchant ? receipt.merchant + ": " : ""}${itemNames}`.slice(
          0,
          200,
        );
      await api.addExpense({
        amount: yourShare,
        category,
        note,
        date: receipt.date || undefined,
      });
      reset();
      onSaved();
    } catch (e: any) {
      Alert.alert("Error", e.message);
      setPhase("select");
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={close}
    >
      <View style={styles.wrap}>
        <View style={styles.sheet}>
          <Text style={styles.title}>📸 Scan receipt</Text>

          {phase === "pick" && (
            <View>
              <Text style={{ color: theme.textDim, marginBottom: 16 }}>
                Take a photo or choose an image of a receipt (Indonesian or
                English). You can pick which items are yours for split bills.
              </Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  style={[styles.btn, styles.btnGhost]}
                  onPress={() => pickImage(true)}
                >
                  <Text style={{ color: theme.text, fontWeight: "600" }}>
                    📷 Camera
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, styles.btnGhost]}
                  onPress={() => pickImage(false)}
                >
                  <Text style={{ color: theme.text, fontWeight: "600" }}>
                    🖼️ Gallery
                  </Text>
                </Pressable>
              </View>
              <Pressable
                style={[styles.btn, styles.btnGhost, { marginTop: 10 }]}
                onPress={close}
              >
                <Text style={{ color: theme.textDim, fontWeight: "600" }}>
                  Cancel
                </Text>
              </Pressable>
            </View>
          )}

          {(phase === "scanning" || phase === "saving") && (
            <View style={{ alignItems: "center", paddingVertical: 30 }}>
              <ActivityIndicator color={theme.accent} size="large" />
              <Text style={{ color: theme.textDim, marginTop: 12 }}>
                {phase === "scanning" ? "Reading receipt…" : "Saving…"}
              </Text>
            </View>
          )}

          {phase === "select" && receipt && (
            <View style={{ maxHeight: "100%" }}>
              <Text style={{ color: theme.textDim, marginBottom: 8 }}>
                {receipt.merchant || "Receipt"}
                {receipt.date ? ` · ${receipt.date}` : ""} — tap the items that
                are yours:
              </Text>
              <ScrollView style={{ maxHeight: 260 }}>
                {receipt.items.map((it, i) => {
                  const sel = selected[i] || 0;
                  const on = sel > 0;
                  return (
                    <Pressable
                      key={i}
                      style={[styles.itemRow, on && styles.itemRowOn]}
                      onPress={() => toggle(i)}
                    >
                      <Text style={{ fontSize: 16 }}>{on ? "✅" : "⬜"}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text }} numberOfLines={1}>
                          {it.name}
                        </Text>
                        {it.qty > 1 && (
                          <Text style={{ color: theme.textDim, fontSize: 11 }}>
                            {formatMoney(it.price / it.qty)} each
                          </Text>
                        )}
                      </View>
                      {it.qty > 1 && (
                        <View style={styles.stepper}>
                          <Pressable
                            style={styles.stepBtn}
                            onPress={() => setQty(i, sel - 1)}
                          >
                            <Text style={styles.stepText}>−</Text>
                          </Pressable>
                          <Text style={styles.stepCount}>
                            {sel}/{it.qty}
                          </Text>
                          <Pressable
                            style={styles.stepBtn}
                            onPress={() => setQty(i, sel + 1)}
                          >
                            <Text style={styles.stepText}>＋</Text>
                          </Pressable>
                        </View>
                      )}
                      <Text style={{ color: theme.text, fontWeight: "600" }}>
                        {formatMoney(
                          it.qty > 1 && on
                            ? Math.round((it.price / it.qty) * sel)
                            : it.price,
                        )}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {(receipt.serviceFee > 0 ||
                receipt.tax > 0 ||
                receipt.discount > 0) && (
                <Text
                  style={{ color: theme.textDim, fontSize: 12, marginTop: 8 }}
                >
                  {receipt.serviceFee > 0 &&
                    `Service ${formatMoney(receipt.serviceFee)}  `}
                  {receipt.tax > 0 && `Tax ${formatMoney(receipt.tax)}  `}
                  {receipt.discount > 0 &&
                    `Discount -${formatMoney(receipt.discount)}  `}
                  (shared proportionally)
                </Text>
              )}

              <View style={styles.totalRow}>
                <Text style={{ color: theme.textDim }}>
                  Your share ({selCount} unit{selCount === 1 ? "" : "s"})
                </Text>
                <Text
                  style={{
                    color: theme.accent,
                    fontSize: 18,
                    fontWeight: "800",
                  }}
                >
                  {formatMoney(yourShare)}
                </Text>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginTop: 8 }}
              >
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
              </ScrollView>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                <Pressable
                  style={[styles.btn, styles.btnGhost]}
                  onPress={close}
                >
                  <Text style={{ color: theme.textDim, fontWeight: "600" }}>
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, { backgroundColor: theme.accent }]}
                  onPress={save}
                >
                  <Text style={{ color: "#0F172A", fontWeight: "700" }}>
                    Save
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  title: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  btn: { flex: 1, alignItems: "center", padding: 14, borderRadius: 10 },
  btnGhost: { backgroundColor: theme.cardAlt },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 10,
    marginBottom: 4,
    backgroundColor: theme.cardAlt,
    opacity: 0.6,
  },
  itemRowOn: { opacity: 1 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  stepBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: theme.card,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: { color: theme.text, fontSize: 14, fontWeight: "700" },
  stepCount: {
    color: theme.textDim,
    fontSize: 12,
    minWidth: 30,
    textAlign: "center",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
  },
  catChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: theme.cardAlt,
    marginRight: 8,
  },
});
