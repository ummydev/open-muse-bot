import "react-native-get-random-values";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Keys, newKeys, Pairing, parsePairing } from "./src/crypto";
import TabFrame from "./src/TabFrame";
import { colors } from "./src/theme";
import { Card, Message, Status, useComputer } from "./src/useComputer";

const KEYS = "omb.keys";
const PAIRING = "omb.pairing";

export default function App() {
  const [ready, setReady] = useState(false);
  const [keys, setKeys] = useState<Keys | null>(null);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      let k = await AsyncStorage.getItem(KEYS).then((v) => (v ? (JSON.parse(v) as Keys) : null));
      if (!k) {
        k = newKeys();
        await AsyncStorage.setItem(KEYS, JSON.stringify(k));
      }
      setKeys(k);
      let p = await AsyncStorage.getItem(PAIRING).then((v) => (v ? (JSON.parse(v) as Pairing) : null));
      if (Platform.OS === "web" && typeof window !== "undefined" && window.location.hash.includes("pair=")) {
        const fromLink = parsePairing(window.location.hash);
        window.history.replaceState(null, "", window.location.pathname);
        if (fromLink) {
          p = fromLink;
          await AsyncStorage.setItem(PAIRING, JSON.stringify(p));
        }
      }
      setPairing(p);
      setReady(true);
    })();
  }, []);

  const pair = useCallback(async (p: Pairing) => {
    await AsyncStorage.setItem(PAIRING, JSON.stringify(p));
    setNotice(null);
    setPairing(p);
  }, []);

  const unpair = useCallback(async (message?: string) => {
    await AsyncStorage.removeItem(PAIRING);
    setPairing(null);
    setNotice(message ?? null);
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        {!ready || !keys ? (
          <ActivityIndicator style={{ flex: 1 }} color={colors.accent} />
        ) : pairing ? (
          <Home pairing={pairing} keys={keys} onUnpair={unpair} />
        ) : (
          <PairScreen onPair={pair} notice={notice} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function PairScreen({ onPair, notice }: { onPair: (p: Pairing) => void; notice: string | null }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const p = parsePairing(code);
    if (!p) return setError("That doesn't look like a pairing code. It starts with omb1.");
    onPair(p);
  };
  return (
    <View style={styles.pair}>
      <Text style={styles.brand}>Open Muse Bot</Text>
      <Text style={styles.pairTitle}>Your agent, in your pocket</Text>
      <Text style={styles.pairBody}>
        On the computer where your agent runs (your Mac or a VPS), run this in a terminal, or ask Claude Code to run it:
      </Text>
      <View style={styles.codeBox}>
        <Text selectable style={styles.mono}>
          npm i -g github:ummydev/open-muse-bot{"\n"}open-muse-bot setup{"\n"}open-muse-bot start --detach
        </Text>
      </View>
      <Text style={styles.pairBody}>Then open the link it prints on this device, or paste the pairing code here.</Text>
      <TextInput
        value={code}
        onChangeText={(t) => {
          setCode(t);
          setError(null);
        }}
        placeholder="omb1.…"
        placeholderTextColor={colors.faint}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
        onSubmitEditing={submit}
      />
      {error || notice ? <Text style={styles.error}>{error || notice}</Text> : null}
      <Pressable style={styles.primary} onPress={submit}>
        <Text style={styles.primaryText}>Connect</Text>
      </Pressable>
    </View>
  );
}

const STATUS_LABEL: Record<Status, string> = {
  connecting: "Connecting…",
  online: "Online",
  "computer-offline": "Your computer is offline",
  offline: "Reconnecting…",
};

function Home({ pairing, keys, onUnpair }: { pairing: Pairing; keys: Keys; onUnpair: (m?: string) => void }) {
  const deviceName = useMemo(() => `${Platform.OS === "web" ? "Browser" : Platform.OS === "ios" ? "iPhone" : "Android"}`, []);
  const computer = useComputer(pairing, keys, deviceName, onUnpair);
  const [tab, setTab] = useState<string>("chat");
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (tab !== "chat" && !computer.tabs.some((t) => t.id === tab)) setTab("chat");
  }, [computer.tabs, tab]);

  const current = computer.tabs.find((t) => t.id === tab);
  useEffect(() => {
    if (current) computer.loadTab(current.id);
    // reload when the agent rewrites the tab
  }, [current?.id, current?.updatedAt, computer.status]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{tab === "chat" ? "Your agent" : current?.title}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: computer.status === "online" ? "#3C9A6B" : colors.faint }]} />
            <Text style={styles.statusText}>
              {pairing.n ? `${pairing.n} · ` : ""}
              {STATUS_LABEL[computer.status]}
            </Text>
          </View>
        </View>
        <Pressable onPress={() => setMenu((m) => !m)} hitSlop={10} accessibilityLabel="Settings">
          <Text style={styles.menuButton}>•••</Text>
        </Pressable>
      </View>
      {menu ? (
        <View style={styles.menu}>
          <Pressable
            onPress={() => {
              computer.forget();
              onUnpair();
            }}
          >
            <Text style={[styles.menuItem, { color: colors.danger }]}>Unpair this device</Text>
          </Pressable>
        </View>
      ) : null}

      {tab === "chat" ? (
        <Chat computer={computer} />
      ) : (
        <View style={{ flex: 1, backgroundColor: colors.surface }}>
          {current && computer.tabHtml[current.id] ? (
            <TabFrame key={`${current.id}-${current.updatedAt}`} html={computer.tabHtml[current.id]!} />
          ) : (
            <ActivityIndicator style={{ flex: 1 }} color={colors.accent} />
          )}
        </View>
      )}

      <View style={styles.tabBar}>
        <TabButton label="Chat" active={tab === "chat"} onPress={() => setTab("chat")} />
        {computer.tabs.map((t) => (
          <TabButton key={t.id} label={t.title} active={tab === t.id} onPress={() => setTab(t.id)} />
        ))}
        <TabButton
          label="+ New"
          active={false}
          onPress={() => {
            setTab("chat");
            computer.sendText("Make me a new tab. Ask me what I'd like to see on it.");
          }}
        />
      </View>
    </View>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tabButton, active && styles.tabButtonActive]}>
      <Text numberOfLines={1} style={[styles.tabLabel, active && styles.tabLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Chat({ computer }: { computer: ReturnType<typeof useComputer> }) {
  const [text, setText] = useState("");
  const list = useRef<FlatList<Message>>(null);
  const data = computer.messages;
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    if (computer.sendText(t)) setText("");
  };
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <FlatList
        ref={list}
        data={data}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 8, gap: 12 }}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => <Bubble message={item} onPrompt={(p) => computer.sendText(p)} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {computer.status === "online" ? "Say hi to your agent." : "Waiting for your computer…"}
          </Text>
        }
        ListFooterComponent={
          computer.busy ? (
            <View style={styles.thinking}>
              <ActivityIndicator size="small" color={colors.muted} />
              <Text style={styles.thinkingText}>{computer.activity || "Thinking…"}</Text>
              <Pressable onPress={computer.cancel} hitSlop={8}>
                <Text style={styles.stop}>Stop</Text>
              </Pressable>
            </View>
          ) : undefined
        }
      />
      <View style={styles.composer}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Message your agent"
          placeholderTextColor={colors.faint}
          style={styles.composerInput}
          multiline
          onKeyPress={(e: any) => {
            if (Platform.OS === "web" && e.nativeEvent.key === "Enter" && !e.nativeEvent.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Pressable style={[styles.send, !text.trim() && { opacity: 0.4 }]} onPress={submit} disabled={!text.trim()}>
          <Text style={styles.sendText}>↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ message, onPrompt }: { message: Message; onPrompt: (p: string) => void }) {
  const mine = message.role === "user";
  return (
    <View style={{ alignItems: mine ? "flex-end" : "flex-start", gap: 8 }}>
      {message.text ? (
        <View style={mine ? styles.userBubble : styles.agentText}>
          <Text selectable style={mine ? styles.userTextColor : styles.agentTextColor}>
            {message.text}
          </Text>
        </View>
      ) : null}
      {message.cards?.map((c, i) => <CardView key={i} card={c} onPrompt={onPrompt} />)}
      {message.error ? <Text style={styles.error}>{message.error}</Text> : null}
    </View>
  );
}

function CardView({ card, onPrompt }: { card: Card; onPrompt: (p: string) => void }) {
  return (
    <View style={styles.card}>
      {card.title ? <Text style={styles.cardTitle}>{card.title}</Text> : null}
      {card.body ? <Text style={styles.cardBody}>{card.body}</Text> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
        {card.actions?.map((a, i) => (
          <Pressable
            key={i}
            style={i === 0 ? styles.primarySmall : styles.secondarySmall}
            onPress={() => (a.url ? Linking.openURL(a.url) : a.prompt ? onPrompt(a.prompt) : undefined)}
          >
            <Text style={i === 0 ? styles.primaryText : styles.secondaryText}>{a.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, width: "100%", maxWidth: 760, alignSelf: "center" },
  pair: { flex: 1, padding: 28, justifyContent: "center", gap: 14, maxWidth: 520, width: "100%", alignSelf: "center" },
  brand: { color: colors.accent, fontSize: 14, fontWeight: "600", letterSpacing: 0.3 },
  pairTitle: { color: colors.text, fontSize: 30, fontWeight: "600", lineHeight: 36 },
  pairBody: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  codeBox: { backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12 },
  mono: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, Menlo, monospace" }), fontSize: 13, color: colors.text },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  error: { color: colors.danger, fontSize: 14 },
  primary: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { fontSize: 20, fontWeight: "600", color: colors.text },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { color: colors.muted, fontSize: 13 },
  menuButton: { color: colors.muted, fontSize: 18, letterSpacing: 1 },
  menu: { position: "absolute", right: 14, top: 58, zIndex: 10, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: 6, paddingHorizontal: 14 },
  menuItem: { fontSize: 15, paddingVertical: 8 },
  empty: { color: colors.faint, textAlign: "center", marginTop: 40, fontSize: 15 },
  userBubble: { backgroundColor: colors.accent, borderRadius: 18, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 10, maxWidth: "85%" },
  userTextColor: { color: "#fff", fontSize: 16, lineHeight: 22 },
  agentText: { maxWidth: "92%" },
  agentTextColor: { color: colors.text, fontSize: 16, lineHeight: 24 },
  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 6, maxWidth: 420, width: "92%" },
  cardTitle: { fontSize: 16, fontWeight: "600", color: colors.text },
  cardBody: { fontSize: 14, lineHeight: 20, color: colors.muted },
  primarySmall: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14 },
  secondarySmall: { backgroundColor: colors.accentSoft, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14 },
  secondaryText: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  thinking: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 4 },
  thinkingText: { color: colors.muted, fontSize: 14, flexShrink: 1 },
  stop: { color: colors.accent, fontSize: 14, fontWeight: "600" },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  composerInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 16,
    color: colors.text,
    maxHeight: 140,
  },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  sendText: { color: "#fff", fontSize: 20, fontWeight: "600" },
  tabBar: { flexDirection: "row", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg, flexWrap: "wrap" },
  tabButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  tabButtonActive: { backgroundColor: colors.accentSoft },
  tabLabel: { color: colors.muted, fontSize: 14, fontWeight: "500", maxWidth: 120 },
  tabLabelActive: { color: colors.accent, fontWeight: "600" },
});
