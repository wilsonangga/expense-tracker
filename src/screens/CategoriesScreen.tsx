import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  Alert,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api";
import type { Category } from "../types";
import { theme } from "../theme";

const COLORS = [
  "#F59E0B",
  "#3B82F6",
  "#EC4899",
  "#6366F1",
  "#10B981",
  "#8B5CF6",
  "#EF4444",
  "#14B8A6",
  "#6B7280",
];
const ICONS = [
  "🍔",
  "🚗",
  "🛍️",
  "🧾",
  "💊",
  "🎬",
  "🏠",
  "✈️",
  "🎓",
  "🎁",
  "☕",
  "📦",
];

export function CategoriesScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(ICONS[0]);
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCategories(await api.listCategories());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const submit = async () => {
    if (!name.trim()) {
      Alert.alert("Invalid name", "Category name is required.");
      return;
    }
    setSaving(true);
    try {
      await api.addCategory({ name: name.trim(), icon, color });
      setModalOpen(false);
      setName("");
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (c: Category) => {
    Alert.alert(
      "Delete category",
      `Delete "${c.name}"? Existing expenses keep their category name.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await api.deleteCategory(c.name);
              setCategories((prev) => prev.filter((x) => x.name !== c.name));
            } catch (err: any) {
              Alert.alert("Error", err.message);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Categories</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={categories}
        keyExtractor={(c) => c.name}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={load}
            tintColor={theme.accent}
          />
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onLongPress={() => confirmDelete(item)}>
            <View style={[styles.colorDot, { backgroundColor: item.color }]} />
            <Text style={{ fontSize: 20 }}>{item.icon}</Text>
            <Text style={{ color: theme.text, fontWeight: "600", flex: 1 }}>
              {item.name}
            </Text>
          </Pressable>
        )}
        ListFooterComponent={
          <Text
            style={{
              color: theme.textDim,
              fontSize: 12,
              textAlign: "center",
              marginTop: 12,
            }}
          >
            Long-press a category to delete it.
          </Text>
        }
        contentContainerStyle={{ paddingBottom: 90 }}
      />

      <Pressable style={styles.fab} onPress={() => setModalOpen(true)}>
        <Text style={{ fontSize: 28, color: "#0F172A", fontWeight: "700" }}>
          ＋
        </Text>
      </Pressable>

      <Modal
        visible={modalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setModalOpen(false)}
      >
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>New category</Text>
            <TextInput
              style={styles.input}
              placeholder="Name"
              placeholderTextColor={theme.textDim}
              value={name}
              onChangeText={setName}
              autoFocus
            />
            <Text style={styles.fieldLabel}>Icon</Text>
            <View style={styles.chipWrap}>
              {ICONS.map((i) => (
                <Pressable
                  key={i}
                  style={[styles.iconChip, icon === i && styles.chipActive]}
                  onPress={() => setIcon(i)}
                >
                  <Text style={{ fontSize: 20 }}>{i}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Color</Text>
            <View style={styles.chipWrap}>
              {COLORS.map((c) => (
                <Pressable
                  key={c}
                  style={[
                    styles.colorChip,
                    { backgroundColor: c },
                    color === c && styles.chipActive,
                  ]}
                  onPress={() => setColor(c)}
                />
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
                  { backgroundColor: theme.accent, opacity: saving ? 0.6 : 1 },
                ]}
                onPress={submit}
                disabled={saving}
              >
                <Text style={{ color: "#0F172A", fontWeight: "700" }}>
                  {saving ? "Saving…" : "Save"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  colorDot: { width: 12, height: 12, borderRadius: 6 },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
  },
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
  fieldLabel: {
    color: theme.textDim,
    fontSize: 12,
    marginTop: 6,
    marginBottom: 6,
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  iconChip: { padding: 8, borderRadius: 10, backgroundColor: theme.cardAlt },
  colorChip: { width: 32, height: 32, borderRadius: 16 },
  chipActive: { borderWidth: 2, borderColor: theme.text },
  btn: { flex: 1, alignItems: "center", padding: 14, borderRadius: 10 },
  btnGhost: { backgroundColor: theme.cardAlt },
});
