// Layout and component styling adapted from OpenMuse (https://github.com/CopilotKit/openmuse, MIT,
// Copyright (c) 2026 OpenMuse contributors). See THIRD_PARTY_NOTICES.md.
import "react-native-get-random-values";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import {
  ArrowUp,
  Bell,
  CalendarDays,
  CheckSquare,
  LayoutGrid,
  LineChart,
  Mail,
  Menu,
  MessageCircle,
  Monitor,
  Newspaper,
  Plus,
  Sparkles,
  Square,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react-native";
import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Keys, newKeys, Pairing, parsePairing } from "./src/crypto";
import Mascot from "./src/Mascot";
import TabFrame from "./src/TabFrame";
import { colors } from "./src/theme";
import { Card, Message, Status, Tab, useComputer } from "./src/useComputer";

const KEYS = "omb.keys";
const PAIRING = "omb.pairing";
const AGENT_NAME = "Muse Bot";
const noFocusRing = Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : {};

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
      if (Platform.OS !== "web") {
        const fromUrl = parsePairing((await Linking.getInitialURL()) ?? "");
        if (fromUrl) {
          p = fromUrl;
          await AsyncStorage.setItem(PAIRING, JSON.stringify(p));
        }
      }
      setPairing(p);
      setReady(true);
    })();
  }, []);

  // A pairing link opened while the app is running (openmusebot://pair?code=omb1.…, or a scanned QR code).
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Linking.addEventListener("url", ({ url }) => {
      const p = parsePairing(url);
      if (p) void AsyncStorage.setItem(PAIRING, JSON.stringify(p)).then(() => (setNotice(null), setPairing(p)));
    });
    return () => sub.remove();
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
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "bottom"]}>
        <View style={{ flex: 1, width: "100%", maxWidth: 760, alignSelf: "center" }}>
          {!ready || !keys ? (
            <ActivityIndicator style={{ flex: 1 }} color={colors.text} />
          ) : pairing ? (
            <Home pairing={pairing} keys={keys} onUnpair={unpair} />
          ) : (
            <PairScreen onPair={pair} notice={notice} />
          )}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ---------- shared pieces (Muse shapes) ----------

function IconButton({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [s.iconButton, { backgroundColor: pressed ? colors.line : colors.card }]}
    >
      <Icon size={20} strokeWidth={1.8} color={colors.text} />
    </Pressable>
  );
}

function Button({
  children,
  onPress,
  primary,
  small,
  danger,
  style,
}: {
  children: ReactNode;
  onPress: () => void;
  primary?: boolean;
  small?: boolean;
  danger?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        { backgroundColor: primary ? colors.primary : "#F1F2F3" },
        small && { minHeight: 38, paddingVertical: 7, paddingHorizontal: 14 },
        pressed && { transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      <Text style={[s.buttonText, { color: danger ? colors.danger : colors.text }]}>{children}</Text>
    </Pressable>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable style={s.shade} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => {}}>
          <View style={s.grabber} />
          <View style={[s.between, { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line }]}>
            <Text style={s.title}>{title}</Text>
            <IconButton icon={X} label="Close" onPress={onClose} />
          </View>
          <View style={{ padding: 20, gap: 12 }}>{children}</View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------- pairing ----------

function PairScreen({ onPair, notice }: { onPair: (p: Pairing) => void; notice: string | null }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const submit = () => {
    const p = parsePairing(code);
    if (!p) return setError("That doesn't look like a pairing code. It starts with omb1.");
    onPair(p);
  };
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 22, gap: 18 }} keyboardShouldPersistTaps="handled">
      <View style={{ alignItems: "center", gap: 6, marginBottom: 6 }}>
        <Mascot size={88} />
        <Text style={[s.title, { fontSize: 26, marginTop: 8 }]}>Meet your agent</Text>
        <Text style={[s.muted, { textAlign: "center", maxWidth: 320 }]}>
          Your Claude Code or Codex, on your own computer, in your pocket.
        </Text>
      </View>
      <View style={s.card}>
        <Text style={s.heading}>1 · On your Mac or VPS</Text>
        <Text style={[s.muted, { marginTop: 4, marginBottom: 12 }]}>Run this in a terminal, or ask Claude Code to run it:</Text>
        <View style={s.codeBox}>
          <Text selectable style={s.mono}>
            npm i -g github:ummydev/open-muse-bot{"\n"}open-muse-bot setup{"\n"}open-muse-bot start --detach
          </Text>
        </View>
        <View style={s.divider} />
        <Text style={s.heading}>2 · Pair this device</Text>
        <Text style={[s.muted, { marginTop: 4, marginBottom: 12 }]}>Open the link it prints on this device, or paste the code:</Text>
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
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={submit}
          style={[s.input, focused && { borderColor: colors.primaryLine }, noFocusRing]}
        />
        {error || notice ? <Text style={[s.small, { color: colors.danger, marginTop: 8 }]}>{error || notice}</Text> : null}
        <Button primary onPress={submit} style={{ marginTop: 14 }}>
          Connect
        </Button>
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------- home ----------

const STATUS_LINE: Record<Status, string> = {
  connecting: "Connecting…",
  online: "Here when you need me",
  "computer-offline": "Your computer is offline",
  offline: "Reconnecting…",
};

function tabIcon(title: string): LucideIcon {
  const t = title.toLowerCase();
  if (/news|feed|brief|digest|hacker/.test(t)) return Newspaper;
  if (/mail|inbox|email/.test(t)) return Mail;
  if (/calendar|schedule|agenda/.test(t)) return CalendarDays;
  if (/stock|market|price|finance|option|crypto|money|chart/.test(t)) return LineChart;
  if (/todo|task|habit|goal|check/.test(t)) return CheckSquare;
  if (/idea|suggest/.test(t)) return Sparkles;
  return LayoutGrid;
}

function Home({ pairing, keys, onUnpair }: { pairing: Pairing; keys: Keys; onUnpair: (m?: string) => void }) {
  const deviceName = useMemo(() => (Platform.OS === "web" ? "Browser" : Platform.OS === "ios" ? "iPhone" : "Android"), []);
  const computer = useComputer(pairing, keys, deviceName, onUnpair);
  const [section, setSection] = useState<string>("chat");
  const [sheet, setSheet] = useState<null | "menu" | "notifications" | "computer">(null);

  useEffect(() => {
    if (section !== "chat" && !computer.tabs.some((t) => t.id === section)) setSection("chat");
  }, [computer.tabs, section]);

  const current = computer.tabs.find((t) => t.id === section);
  useEffect(() => {
    if (current) computer.loadTab(current.id);
  }, [current?.id, current?.updatedAt, computer.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const online = computer.status === "online";
  const statusLine = computer.busy ? computer.activity || "Working on it…" : STATUS_LINE[computer.status];
  const newTab = () => {
    setSection("chat");
    computer.sendText("Make me a new tab. Ask me what I'd like to see on it.");
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Header: menu · mascot, name, status, computer pill · bell */}
      <View style={{ paddingTop: 2, marginHorizontal: 20, marginBottom: 6 }}>
        <View style={{ position: "absolute", left: 0, top: 16, zIndex: 1 }}>
          <IconButton icon={Menu} label="Open menu" onPress={() => setSheet("menu")} />
        </View>
        <View style={{ alignItems: "center", gap: 1 }}>
          <Mascot size={49} />
          <Text style={{ fontSize: 16, fontWeight: "600", color: colors.text, letterSpacing: -0.4 }}>{AGENT_NAME}</Text>
          <Text numberOfLines={1} style={{ fontSize: 11, color: colors.muted, marginBottom: 6, maxWidth: "70%" }}>
            {section === "chat" ? statusLine : current?.title}
          </Text>
          {section === "chat" && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Your computer"
              onPress={() => setSheet("computer")}
              style={({ pressed }) => [s.computerPill, pressed && { backgroundColor: colors.line }]}
            >
              <Monitor size={14} strokeWidth={1.8} color={colors.muted} />
              <Text style={{ fontSize: 12, color: colors.muted }}>
                {pairing.n || "Computer"} · {online ? "online" : computer.status === "computer-offline" ? "offline" : "connecting"}
              </Text>
              <View style={[s.dot, { backgroundColor: online ? colors.online : colors.faint }]} />
            </Pressable>
          )}
        </View>
        <View style={{ position: "absolute", right: 0, top: 16 }}>
          <IconButton icon={Bell} label="Notifications" onPress={() => setSheet("notifications")} />
        </View>
      </View>

      <View style={{ flex: 1, minHeight: 0 }}>
        {section === "chat" ? (
          <Chat computer={computer} onNewTab={newTab} />
        ) : (
          <View style={{ flex: 1, marginHorizontal: 12, borderRadius: 23, overflow: "hidden", backgroundColor: colors.card }}>
            {current && computer.tabHtml[current.id] ? (
              <TabFrame key={`${current.id}-${current.updatedAt}`} html={computer.tabHtml[current.id]!} />
            ) : (
              <ActivityIndicator style={{ flex: 1 }} color={colors.text} />
            )}
          </View>
        )}
      </View>

      <NavPill tabs={computer.tabs} section={section} onSelect={setSection} onNewTab={newTab} />

      {sheet === "menu" && (
        <Sheet title="Menu" onClose={() => setSheet(null)}>
          <Text style={s.label}>Tabs</Text>
          {computer.tabs.length === 0 ? (
            <Text style={s.muted}>No tabs yet. Ask your agent to make one, like "a morning news tab".</Text>
          ) : (
            computer.tabs.map((t) => {
              const Icon = tabIcon(t.title);
              return (
                <Pressable key={t.id} style={[s.row, { gap: 14, paddingVertical: 6 }]} onPress={() => (setSection(t.id), setSheet(null))}>
                  <View style={s.iconBox}>
                    <Icon size={19} color={colors.text} />
                  </View>
                  <Text style={[s.text, { fontWeight: "500" }]}>{t.title}</Text>
                </Pressable>
              );
            })
          )}
          <Button small onPress={() => (setSheet(null), newTab())} style={{ alignSelf: "flex-start" }}>
            New tab
          </Button>
        </Sheet>
      )}
      {sheet === "notifications" && (
        <Sheet title="Notifications" onClose={() => setSheet(null)}>
          <Text style={s.muted}>You're all caught up.</Text>
        </Sheet>
      )}
      {sheet === "computer" && (
        <Sheet title={pairing.n || "Your computer"} onClose={() => setSheet(null)}>
          <View style={[s.row, { gap: 8 }]}>
            <View style={[s.dot, { backgroundColor: online ? colors.online : colors.faint }]} />
            <Text style={s.text}>{online ? "Online" : STATUS_LINE[computer.status]}</Text>
          </View>
          <Text style={s.muted}>Your agent runs on this computer. Chats and tabs stay there, end-to-end encrypted.</Text>
          <Button
            small
            danger
            style={{ alignSelf: "flex-start", marginTop: 6 }}
            onPress={() => {
              setSheet(null);
              computer.forget();
              onUnpair();
            }}
          >
            Unpair this device
          </Button>
        </Sheet>
      )}
    </View>
  );
}

function NavPill({
  tabs,
  section,
  onSelect,
  onNewTab,
}: {
  tabs: Tab[];
  section: string;
  onSelect: (id: string) => void;
  onNewTab: () => void;
}) {
  const items: { id: string; label: string; icon: LucideIcon }[] = [
    { id: "chat", label: "Chat", icon: MessageCircle },
    ...tabs.slice(0, 3).map((t) => ({ id: t.id, label: t.title, icon: tabIcon(t.title) })),
    { id: "+new", label: "New tab", icon: Plus },
  ];
  return (
    <View style={{ paddingHorizontal: 22, paddingTop: 10, paddingBottom: 7, alignItems: "center" }}>
      <View style={[s.nav, { maxWidth: Math.min(370, items.length * 74) }]}>
        {items.map((item) => {
          const active = section === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: active }}
              onPress={() => (item.id === "+new" ? onNewTab() : onSelect(item.id))}
              style={[s.navItem, active && { backgroundColor: colors.pressed }]}
            >
              <item.icon size={23} strokeWidth={1.8} color={colors.text} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------- chat ----------

function Chat({ computer, onNewTab }: { computer: ReturnType<typeof useComputer>; onNewTab: () => void }) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const replying = computer.busy;
  const send = () => {
    const t = draft.trim();
    if (!t) return;
    if (computer.sendText(t)) setDraft("");
  };
  return (
    <KeyboardAvoidingView style={{ flex: 1, paddingHorizontal: 17 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 16, gap: 12 }}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {computer.messages.length === 0 && (
          <Text style={[s.muted, { textAlign: "center", marginTop: 40 }]}>
            {computer.status === "online" ? "Ask for anything. I'm running on your computer." : "Waiting for your computer…"}
          </Text>
        )}
        {computer.messages.map((m) => (
          <Bubble key={m.id} message={m} onPrompt={(p) => computer.sendText(p)} />
        ))}
        {replying && computer.activity ? <ActivityCard text={computer.activity} /> : null}
        {replying && <TypingDots />}
      </ScrollView>

      <View style={[s.composer, focused && { borderColor: colors.primaryLine, shadowOpacity: 0.1 }]}>
        <View style={[s.row, { gap: 7, alignItems: "flex-end" }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New tab"
            onPress={onNewTab}
            style={({ pressed }) => [s.roundButton, { backgroundColor: pressed ? colors.primarySoft : "transparent" }]}
          >
            <Text style={{ color: colors.text, fontSize: 29, fontWeight: "300", lineHeight: 32 }}>+</Text>
          </Pressable>
          <TextInput
            accessibilityLabel="Message your agent"
            value={draft}
            onChangeText={setDraft}
            placeholder={computer.status === "online" ? "Message…" : "Connecting…"}
            placeholderTextColor="#949B9F"
            selectionColor={colors.text}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            multiline
            style={[s.composerInput, noFocusRing]}
            onKeyPress={
              Platform.OS === "web"
                ? (e: any) => {
                    if (e.nativeEvent.key === "Enter" && !e.nativeEvent.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }
                : undefined
            }
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={replying ? "Stop reply" : "Send message"}
            disabled={!replying && !draft.trim()}
            onPress={replying ? computer.cancel : send}
            style={({ pressed }) => [
              s.roundButton,
              {
                backgroundColor: replying || draft.trim() ? colors.primary : "#F3F5F6",
                transform: [{ scale: pressed ? 0.94 : 1 }],
              },
            ]}
          >
            {replying ? (
              <Square size={18} fill={colors.text} strokeWidth={0} />
            ) : (
              <ArrowUp size={25} strokeWidth={1.8} color={draft.trim() ? colors.text : "#B5B5BA"} />
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ message, onPrompt }: { message: Message; onPrompt: (p: string) => void }) {
  const user = message.role === "user";
  return (
    <View
      style={{
        alignSelf: user ? "flex-end" : "flex-start",
        maxWidth: user ? "85%" : "95%",
        width: message.cards?.length ? "95%" : undefined,
        gap: 8,
      }}
    >
      {message.text ? (
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 13,
            borderRadius: 22,
            borderBottomRightRadius: user ? 7 : 22,
            borderBottomLeftRadius: user ? 22 : 7,
            backgroundColor: user ? colors.primary : colors.bubble,
          }}
        >
          <Text selectable style={[s.text, { fontSize: 16, lineHeight: 24 }]}>
            {message.text}
          </Text>
        </View>
      ) : null}
      {message.cards?.map((c, i) => <CardView key={i} card={c} onPrompt={onPrompt} />)}
      {message.error ? (
        <View accessibilityRole="alert" style={s.error}>
          <Text style={[s.text, { color: colors.danger, fontWeight: "600" }]}>Something went wrong</Text>
          <Text numberOfLines={4} style={[s.small, { color: colors.danger }]}>
            {message.error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function ActivityCard({ text }: { text: string }) {
  return (
    <View style={[s.toolCard, { alignSelf: "flex-start", width: "95%" }]}>
      <View style={[s.row, { gap: 12 }]}>
        <View style={s.iconBox}>
          <Wrench size={19} color={colors.text} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.heading}>Working</Text>
          <Text numberOfLines={2} style={s.muted}>
            {text}
          </Text>
        </View>
        <ActivityIndicator size="small" color={colors.muted} />
      </View>
    </View>
  );
}

function TypingDots() {
  return (
    <View accessibilityLabel="Agent is working" style={[s.row, s.typing]}>
      {[0.4, 0.75, 0.5].map((o) => (
        <View key={o} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.muted, opacity: o }} />
      ))}
    </View>
  );
}

function CardView({ card, onPrompt }: { card: Card; onPrompt: (p: string) => void }) {
  return (
    <View style={s.toolCard}>
      <View style={[s.row, { gap: 12, marginBottom: card.body ? 10 : 0 }]}>
        <View style={s.iconBox}>
          <Sparkles size={19} color={colors.text} />
        </View>
        {card.title ? <Text style={[s.heading, { flex: 1 }]}>{card.title}</Text> : null}
      </View>
      {card.body ? (
        <View style={s.innerCard}>
          <Text style={[s.text, { fontSize: 15 }]}>{card.body}</Text>
        </View>
      ) : null}
      {card.actions?.length ? (
        <View style={[s.row, { flexWrap: "wrap", gap: 8, marginTop: 12 }]}>
          {card.actions.map((a, i) => (
            <Button
              key={i}
              small
              primary={i === 0}
              onPress={() => (a.url ? Linking.openURL(a.url) : a.prompt ? onPrompt(a.prompt) : undefined)}
            >
              {a.label}
            </Button>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  text: { color: colors.text, fontSize: 15, lineHeight: 23 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  small: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  label: { color: colors.muted, fontSize: 10, fontWeight: "700", letterSpacing: 1.4, textTransform: "uppercase" },
  title: { color: colors.text, fontSize: 23, fontWeight: "600", letterSpacing: -0.7 },
  heading: { color: colors.text, fontSize: 16, fontWeight: "600", letterSpacing: -0.25 },
  card: { backgroundColor: colors.card, borderRadius: 23, padding: 20, borderWidth: 1, borderColor: colors.line },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 18 },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22 },
  iconBox: { width: 42, height: 42, borderRadius: 13, justifyContent: "center", alignItems: "center", backgroundColor: colors.primarySoft },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 17,
    minHeight: 46,
    paddingVertical: 10,
    borderRadius: 24,
  },
  buttonText: { fontSize: 15, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 19,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
    backgroundColor: "#FFF",
    minHeight: 45,
  },
  codeBox: { backgroundColor: "#F6F6F7", borderRadius: 14, padding: 14 },
  mono: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, Menlo, monospace" }), fontSize: 12.5, lineHeight: 20, color: colors.text },
  computerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#F3F3F5",
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  error: { padding: 16, borderRadius: 18, backgroundColor: "#FBEFED", gap: 4 },
  toolCard: { backgroundColor: colors.bubble, borderRadius: 26, padding: 14, width: "100%", maxWidth: 520 },
  innerCard: { backgroundColor: colors.card, borderRadius: 18, padding: 16 },
  typing: { alignSelf: "flex-start", gap: 7, paddingHorizontal: 19, paddingVertical: 18, backgroundColor: colors.bubble, borderRadius: 28 },
  composer: {
    backgroundColor: "#FFF",
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "#EEF0F2",
    padding: 8,
    shadowColor: "#1A1A1A",
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  composerInput: {
    flex: 1,
    color: colors.text,
    minHeight: 44,
    maxHeight: 140,
    fontSize: 17,
    lineHeight: 24,
    paddingHorizontal: 2,
    paddingTop: 10,
    paddingBottom: 10,
  },
  roundButton: { width: 44, height: 44, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  nav: {
    flexDirection: "row",
    width: "100%",
    maxWidth: 370,
    padding: 5,
    backgroundColor: "#FFF",
    borderRadius: 40,
    shadowColor: "#1A1A1A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#F8F8F8",
  },
  navItem: { flex: 1, height: 47, alignItems: "center", justifyContent: "center", borderRadius: 28 },
  shade: { flex: 1, backgroundColor: "rgba(20,20,20,0.25)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.canvas, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: "90%" },
  grabber: { alignSelf: "center", width: 34, height: 4, borderRadius: 3, backgroundColor: "#D8DBDE", marginTop: 10 },
});
