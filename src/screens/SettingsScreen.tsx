import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Alert,
  ScrollView,
} from "react-native";
import { loadSettings, saveSettings } from "../api";
import { theme } from "../theme";

export function SettingsScreen() {
  const [serverUrl, setServerUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    loadSettings().then((s) => {
      setServerUrl(s.serverUrl);
      setApiKey(s.apiKey);
    });
  }, []);

  const save = async () => {
    await saveSettings({ serverUrl: serverUrl.trim(), apiKey: apiKey.trim() });
    Alert.alert("Saved", "Settings updated.");
  };

  const test = async () => {
    setStatus("Testing…");
    try {
      const res = await fetch(`${serverUrl.trim().replace(/\/$/, "")}/health`);
      setStatus(
        res.ok ? "✅ Server reachable" : `⚠️ Server responded ${res.status}`,
      );
    } catch (e: any) {
      setStatus(`❌ ${e.message}`);
    }
  };

  return (
    <ScrollView style={styles.screen}>
      <Text style={styles.title}>Settings</Text>

      <Text style={styles.label}>Server URL</Text>
      <TextInput
        style={styles.input}
        placeholder="http://192.168.1.10:3000"
        placeholderTextColor={theme.textDim}
        autoCapitalize="none"
        autoCorrect={false}
        value={serverUrl}
        onChangeText={setServerUrl}
      />

      <Text style={styles.label}>API key</Text>
      <TextInput
        style={styles.input}
        placeholder="Same value as API_KEY in server .env"
        placeholderTextColor={theme.textDim}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        value={apiKey}
        onChangeText={setApiKey}
      />

      <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={test}>
          <Text style={{ color: theme.textDim, fontWeight: "600" }}>
            Test connection
          </Text>
        </Pressable>
        <Pressable
          style={[styles.btn, { backgroundColor: theme.accent }]}
          onPress={save}
        >
          <Text style={{ color: "#0F172A", fontWeight: "700" }}>Save</Text>
        </Pressable>
      </View>
      {status && (
        <Text style={{ color: theme.textDim, marginTop: 12 }}>{status}</Text>
      )}

      <View style={styles.infoCard}>
        <Text style={{ color: theme.text, fontWeight: "700", marginBottom: 6 }}>
          🤖 Telegram bot
        </Text>
        <Text style={{ color: theme.textDim, lineHeight: 20 }}>
          Chat with your bot to record expenses on the go, e.g. "25000 lunch" or
          "transport 15k gojek". Entries appear here automatically — pull to
          refresh.
        </Text>
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
    marginBottom: 16,
  },
  label: { color: theme.textDim, fontSize: 13, marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: theme.card,
    borderRadius: 10,
    padding: 12,
    color: theme.text,
  },
  btn: { flex: 1, alignItems: "center", padding: 14, borderRadius: 10 },
  btnGhost: { backgroundColor: theme.card },
  infoCard: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
  },
});
