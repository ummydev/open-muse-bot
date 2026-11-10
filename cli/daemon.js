// The daemon: keeps the relay connection, answers paired devices, runs the agent one turn at a time and
// serves the custom tabs the agent writes into the workspace.
import fs from "node:fs";
import path from "node:path";
import { ensureSession, runTurn } from "./agent.js";
import { loadConfig, loadHistory, saveConfig, saveHistory } from "./config.js";
import { open, randomId, seal } from "./crypto.js";
import { connectRelay } from "./relay.js";

const CARD_RE = /```omb-card\s*\n([\s\S]*?)```/g;

/** Splits ```omb-card``` blocks out of the agent's reply into cards. */
export function extractCards(text) {
  const cards = [];
  const rest = text.replace(CARD_RE, (_, json) => {
    try {
      const card = JSON.parse(json);
      if (card && typeof card === "object") cards.push(card);
    } catch {
      return _;
    }
    return "";
  });
  return { text: rest.trim(), cards };
}

export function onboardingMessages(agent) {
  const now = Date.now();
  const gmail =
    agent === "claude"
      ? {
          title: "Connect Gmail",
          body: "Let me read your inbox so I can flag what matters each morning. You connect it once in Claude; I only read until you ask me to send.",
          actions: [{ label: "Connect Gmail", url: "https://claude.ai/customize/connectors" }],
        }
      : {
          title: "Connect Gmail",
          body: "Let me read your inbox so I can flag what matters each morning. Connect it through Composio with your own account.",
          actions: [{ label: "Set it up", prompt: "Help me connect my Gmail through Composio Connect (https://connect.composio.dev/mcp)." }],
        };
  return [
    {
      id: randomId(8),
      role: "assistant",
      ts: now,
      text: "Hi! I'm your personal agent. I run on your computer, and you can reach me from here anytime.",
    },
    { id: randomId(8), role: "assistant", ts: now + 1, text: "", cards: [gmail] },
    {
      id: randomId(8),
      role: "assistant",
      ts: now + 2,
      text: "",
      cards: [
        {
          title: "Make me a tab",
          body: "Describe a dashboard or feed you'd like to check every day, and I'll build it as its own tab in this app.",
          actions: [{ label: "Try a daily briefing", prompt: "Make me a 'Today' tab: a daily briefing with the date, the weather where I am, and three things worth my attention." }],
        },
      ],
    },
  ];
}

function readTabs(workspace) {
  const dir = path.join(workspace, "tabs");
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const tabs = [];
  for (const e of entries) {
    if (!e.isDirectory() || !/^[\w-]{1,64}$/.test(e.name)) continue;
    const html = path.join(dir, e.name, "index.html");
    if (!fs.existsSync(html)) continue;
    let meta = {};
    try {
      meta = JSON.parse(fs.readFileSync(path.join(dir, e.name, "tab.json"), "utf8"));
    } catch {
      // optional
    }
    const stamp = [html, path.join(dir, e.name, "data.json")].map((f) => {
      try {
        return fs.statSync(f).mtimeMs;
      } catch {
        return 0;
      }
    });
    tabs.push({ id: e.name, title: String(meta.title || e.name).slice(0, 24), updatedAt: Math.max(...stamp) });
  }
  return tabs.sort((a, b) => a.id.localeCompare(b.id));
}

function readTabHtml(workspace, id) {
  if (!/^[\w-]{1,64}$/.test(id)) return null;
  const dir = path.join(workspace, "tabs", id);
  let html;
  try {
    html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  } catch {
    return null;
  }
  let data = "null";
  try {
    data = JSON.stringify(JSON.parse(fs.readFileSync(path.join(dir, "data.json"), "utf8")));
  } catch {
    // no data
  }
  const inject = `<script>window.TAB_DATA=${data.replace(/</g, "\\u003c")};</script>`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + inject) : inject + html;
}

export async function runDaemon({ log = console.log } = {}) {
  let config = loadConfig();
  if (!config) throw new Error("Not set up yet. Run: open-muse-bot setup");
  fs.mkdirSync(config.workspace, { recursive: true });
  const ensured = await ensureSession(config);
  if (!ensured.ok) log(`warning: couldn't create the agent session:\n${ensured.out.trim().slice(-800)}`);

  let messages = loadHistory();
  let busy = false;
  let activity = null;
  let current = null;
  const queue = [];
  let tabs = readTabs(config.workspace);
  let online = false;

  const devices = () => config.devices || [];
  const send = (deviceKey, value) => relay.send({ t: "msg", to: deviceKey, ...seal(value, deviceKey, config.keys.secretKey) });
  const broadcast = (value) => devices().forEach((d) => send(d.key, value));
  const upsert = (message, persist = true) => {
    const i = messages.findIndex((m) => m.id === message.id);
    if (i === -1) messages.push(message);
    else messages[i] = message;
    if (persist) saveHistory(messages);
    broadcast({ t: "upsert", message });
  };
  const setBusy = (b, a = null) => {
    busy = b;
    activity = a;
    broadcast({ t: "busy", busy, activity });
  };
  const state = () => ({ t: "state", messages: messages.slice(-200), tabs, busy, activity, agent: config.agent });

  async function pump() {
    if (busy || queue.length === 0) return;
    const prompt = queue.shift();
    const reply = { id: randomId(8), role: "assistant", ts: Date.now(), text: "", streaming: true };
    setBusy(true);
    let last = 0;
    const result = await runTurn({
      ...config,
      prompt,
      primed: config.primed,
      onSpawn: (child) => (current = child),
      onText: (text) => {
        reply.text = text;
        if (Date.now() - last > 150) {
          last = Date.now();
          upsert({ ...reply, text: extractCards(text).text }, false);
        }
      },
      onActivity: (a) => {
        activity = a;
        broadcast({ t: "busy", busy: true, activity: a });
      },
    });
    current = null;
    if (!config.primed) {
      config = { ...config, primed: true };
      saveConfig(config);
    }
    const { text, cards } = extractCards(result.text);
    const final = { ...reply, streaming: false, text, ...(cards.length ? { cards } : {}) };
    if (result.error) final.error = result.error;
    if (!final.text && !cards.length && !result.error) final.text = result.stopReason === "cancelled" ? "Stopped." : "(no reply)";
    upsert(final);
    setBusy(false);
    pump();
  }

  function handle(from, msg) {
    const known = devices().find((d) => d.key === from);
    if (msg.t === "pair") {
      // A device that's already paired is known by its key; the pairing code only matters for new ones.
      if (!known && (!config.pairing || msg.s !== config.pairing.secret || Date.now() > config.pairing.expires)) {
        send(from, { t: "error", code: "pairing", message: "This pairing code has expired. Run `open-muse-bot pair` for a new one." });
        return;
      }
      if (!known) {
        const first = devices().length === 0;
        config = { ...config, devices: [...devices(), { key: from, name: String(msg.name || "device").slice(0, 40), pairedAt: Date.now() }] };
        saveConfig(config);
        log(`paired a new device: ${msg.name || "device"}`);
        if (first && messages.length === 0) {
          messages = onboardingMessages(config.agent);
          saveHistory(messages);
        }
      }
      send(from, { t: "paired", computer: config.name });
      send(from, state());
      return;
    }
    if (!known) {
      send(from, { t: "error", code: "unpaired", message: "This device isn't paired with this computer." });
      return;
    }
    if (msg.t === "hello") send(from, state());
    else if (msg.t === "send" && typeof msg.text === "string" && msg.text.trim()) {
      const text = msg.text.slice(0, 20_000);
      upsert({ id: typeof msg.id === "string" ? msg.id.slice(0, 32) : randomId(8), role: "user", ts: Date.now(), text });
      queue.push(text);
      pump();
    } else if (msg.t === "cancel") current?.kill("SIGINT");
    else if (msg.t === "tab") send(from, { t: "tab", id: msg.id, html: readTabHtml(config.workspace, String(msg.id)) });
    else if (msg.t === "forget") {
      config = { ...config, devices: devices().filter((d) => d.key !== from) };
      saveConfig(config);
    }
  }

  const relay = connectRelay({
    relay: config.relay,
    computerId: config.computerId,
    token: config.token,
    log,
    onState: (o) => (online = o),
    onFrame: (frame) => {
      if (frame.t !== "msg" || typeof frame.k !== "string") return;
      const msg = open(frame, frame.k, config.keys.secretKey);
      if (!msg) return;
      config = loadConfig() || config; // picks up `open-muse-bot pair` run meanwhile
      handle(frame.k, msg);
    },
  });

  setInterval(() => {
    const next = readTabs(config.workspace);
    if (JSON.stringify(next) !== JSON.stringify(tabs)) {
      tabs = next;
      broadcast({ t: "tabs", tabs });
    }
  }, 3000);

  log(`open-muse-bot daemon running (${config.agent} in ${config.workspace})`);
  return { stop: () => relay.stop(), isOnline: () => online };
}
