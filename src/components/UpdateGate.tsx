import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  ActivityIndicator,
  Pressable,
  StyleSheet,
} from "react-native";
import * as Updates from "expo-updates";
import { theme } from "../theme";

type Phase = "idle" | "checking" | "downloading" | "ready" | "error";

/**
 * Checks for an EAS OTA update on mount. While checking/downloading it shows a
 * non-blocking overlay so the user knows an update is in progress, then offers
 * to restart into the new version. No-ops in development (Updates disabled).
 */
export function UpdateGate() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // expo-updates is inactive in Expo Go / dev — skip silently.
      if (__DEV__ || !Updates.isEnabled) return;

      try {
        setPhase("checking");
        setVisible(true);
        const result = await Updates.checkForUpdateAsync();
        if (cancelled) return;

        if (!result.isAvailable) {
          setVisible(false);
          setPhase("idle");
          return;
        }

        setPhase("downloading");
        await Updates.fetchUpdateAsync();
        if (cancelled) return;
        setPhase("ready");
      } catch {
        if (cancelled) return;
        // Network/cold-start failures shouldn't block the app — just hide.
        setVisible(false);
        setPhase("error");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const restart = async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      setVisible(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {phase === "ready" ? (
            <>
              <Text style={styles.emoji}>🎉</Text>
              <Text style={styles.title}>Update ready</Text>
              <Text style={styles.sub}>
                A new version has been downloaded. Restart to apply it.
              </Text>
              <Pressable style={styles.btn} onPress={restart}>
                <Text style={styles.btnText}>Restart now</Text>
              </Pressable>
              <Pressable
                style={styles.laterBtn}
                onPress={() => setVisible(false)}
              >
                <Text style={styles.laterText}>Later</Text>
              </Pressable>
            </>
          ) : (
            <>
              <ActivityIndicator size="large" color={theme.accent} />
              <Text style={styles.title}>
                {phase === "downloading"
                  ? "Downloading update…"
                  : "Checking for updates…"}
              </Text>
              <Text style={styles.sub}>
                {phase === "downloading"
                  ? "Please wait a moment."
                  : "Looking for the latest version."}
              </Text>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 28,
  },
  card: {
    width: "100%",
    backgroundColor: theme.card,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  emoji: { fontSize: 34, marginBottom: 8 },
  title: {
    color: theme.text,
    fontSize: 17,
    fontWeight: "800",
    marginTop: 14,
    textAlign: "center",
  },
  sub: {
    color: theme.textDim,
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
  },
  btn: {
    backgroundColor: theme.accent,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 18,
    alignSelf: "stretch",
    alignItems: "center",
  },
  btnText: { color: "#0F172A", fontWeight: "800" },
  laterBtn: { marginTop: 10, paddingVertical: 8 },
  laterText: { color: theme.textDim, fontWeight: "600" },
});
