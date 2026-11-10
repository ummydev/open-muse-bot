// The connection to the paired computer: one WebSocket to the relay, sealed frames, reconnects, and the
// chat / tabs state the computer sends.
import { useCallback, useEffect, useRef, useState } from "react";
import { Keys, open, Pairing, seal } from "./crypto";

export type Card = { title?: string; body?: string; actions?: { label: string; url?: string; prompt?: string }[] };
export type Message = { id: string; role: "user" | "assistant"; ts: number; text: string; cards?: Card[]; streaming?: boolean; error?: string };
export type Tab = { id: string; title: string; updatedAt: number };

export type Status = "connecting" | "online" | "computer-offline" | "offline";

export function deviceSocketUrl(p: Pairing, keys: Keys) {
  const base = p.r.replace(/\/$/, "").replace(/^http/, "ws");
  return `${base}/ws/device?c=${encodeURIComponent(p.c)}&k=${encodeURIComponent(keys.publicKey)}`;
}

export function useComputer(pairing: Pairing | null, keys: Keys | null, deviceName: string, onUnpaired: (message: string) => void) {
  const [status, setStatus] = useState<Status>("connecting");
  const [messages, setMessages] = useState<Message[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [tabHtml, setTabHtml] = useState<Record<string, string | null>>({});
  const ws = useRef<WebSocket | null>(null);
  const pairedOnce = useRef(false);

  const send = useCallback(
    (value: unknown) => {
      if (!pairing || !keys || ws.current?.readyState !== 1) return false;
      ws.current.send(JSON.stringify({ t: "msg", ...seal(value, pairing.k, keys.secretKey) }));
      return true;
    },
    [pairing, keys],
  );

  useEffect(() => {
    if (!pairing || !keys) return;
    let stopped = false;
    let attempt = 0;
    let ping: ReturnType<typeof setInterval> | undefined;
    pairedOnce.current = false;

    const connect = () => {
      if (stopped) return;
      setStatus("connecting");
      const socket = new WebSocket(deviceSocketUrl(pairing, keys));
      ws.current = socket;
      socket.onopen = () => {
        attempt = 0;
        ping = setInterval(() => socket.readyState === 1 && socket.send("ping"), 25_000);
        const hello = pairedOnce.current ? { t: "hello" } : { t: "pair", s: pairing.s, name: deviceName };
        socket.send(JSON.stringify({ t: "msg", ...seal(hello, pairing.k, keys.secretKey) }));
      };
      socket.onmessage = (event) => {
        if (event.data === "pong") return;
        let frame: any;
        try {
          frame = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (frame.t === "presence") {
          setStatus(frame.online ? "online" : "computer-offline");
          if (frame.online) socket.send(JSON.stringify({ t: "msg", ...seal(pairedOnce.current ? { t: "hello" } : { t: "pair", s: pairing.s, name: deviceName }, pairing.k, keys.secretKey) }));
          return;
        }
        if (frame.t !== "msg") return;
        const msg = open<any>(frame, pairing.k, keys.secretKey);
        if (!msg) return;
        setStatus("online");
        if (msg.t === "paired") pairedOnce.current = true;
        else if (msg.t === "state") {
          pairedOnce.current = true;
          setMessages(msg.messages);
          setTabs(msg.tabs);
          setBusy(msg.busy);
          setActivity(msg.activity);
        } else if (msg.t === "upsert") {
          setMessages((prev) => {
            const i = prev.findIndex((m) => m.id === msg.message.id);
            if (i === -1) return [...prev, msg.message];
            const next = prev.slice();
            next[i] = msg.message;
            return next;
          });
        } else if (msg.t === "busy") {
          setBusy(msg.busy);
          setActivity(msg.activity);
        } else if (msg.t === "tabs") setTabs(msg.tabs);
        else if (msg.t === "tab") setTabHtml((prev) => ({ ...prev, [msg.id]: msg.html }));
        else if (msg.t === "error" && (msg.code === "unpaired" || msg.code === "pairing")) {
          // A device that was paired before can just say hello; a refused pairing means a new code is needed.
          if (pairedOnce.current && msg.code === "pairing") return;
          stopped = true;
          socket.close();
          onUnpaired(msg.message);
        }
      };
      socket.onclose = () => {
        clearInterval(ping);
        if (stopped) return;
        setStatus("offline");
        setTimeout(connect, Math.min(15_000, 800 * 2 ** attempt++));
      };
    };
    connect();
    return () => {
      stopped = true;
      clearInterval(ping);
      ws.current?.close();
    };
  }, [pairing, keys, deviceName, onUnpaired]);

  const sendText = useCallback(
    (text: string) => {
      const id = Math.random().toString(36).slice(2, 10);
      if (!send({ t: "send", id, text })) return false;
      setMessages((prev) => [...prev, { id, role: "user", ts: Date.now(), text }]);
      return true;
    },
    [send],
  );

  return {
    status,
    messages,
    tabs,
    busy,
    activity,
    tabHtml,
    sendText,
    cancel: () => send({ t: "cancel" }),
    loadTab: (id: string) => send({ t: "tab", id }),
    forget: () => send({ t: "forget" }),
  };
}
