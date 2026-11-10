#!/usr/bin/env node
// open-muse-bot: setup | pair | start [--detach] | stop | status
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import qrcode from "qrcode-terminal";
import { DEFAULT_RELAY, home, loadConfig, paths, saveConfig } from "./config.js";
import { b64, newKeyPair, randomId } from "./crypto.js";
import { runDaemon } from "./daemon.js";

const AGENTS = ["claude", "codex", "gemini", "cursor", "copilot", "opencode", "kimi", "deepseek-harness", "goose", "openclaw", "pi"];
const PAIRING_TTL = 30 * 60_000;

function pairingCode(config) {
  const payload = { v: 1, r: config.relay, c: config.computerId, k: config.keys.publicKey, s: config.pairing.secret, n: config.name };
  return `omb1.${b64(Buffer.from(JSON.stringify(payload)))}`;
}

function printPairing(config) {
  const code = pairingCode(config);
  const link = `${config.relay.replace(/\/$/, "")}/#pair=${code}`;
  console.log("\nOpen this link on your phone (or scan it) to pair:\n");
  qrcode.generate(link, { small: true });
  console.log(`\n${link}\n`);
  console.log(`Or paste this pairing code into the app:\n\n${code}\n`);
  console.log(`It works for ${PAIRING_TTL / 60_000} minutes; \`open-muse-bot pair\` makes a new one.`);
}

function newPairing(config) {
  return { ...config, pairing: { secret: randomId(16), expires: Date.now() + PAIRING_TTL } };
}

function running() {
  try {
    const pid = Number(fs.readFileSync(paths.pid, "utf8"));
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

async function main() {
  const [command = "help", ...rest] = process.argv.slice(2);
  const { values } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      relay: { type: "string" },
      agent: { type: "string" },
      workspace: { type: "string" },
      permissions: { type: "string" },
      name: { type: "string" },
      detach: { type: "boolean" },
    },
  });

  if (command === "setup") {
    const existing = loadConfig();
    const agent = values.agent || existing?.agent || "claude";
    if (!AGENTS.includes(agent)) throw new Error(`Unknown agent "${agent}". One of: ${AGENTS.join(", ")}`);
    const permissions = values.permissions || existing?.permissions || "approve-all";
    let config = {
      computerId: existing?.computerId || randomId(16),
      token: existing?.token || randomId(32),
      keys: existing?.keys || newKeyPair(),
      devices: existing?.devices || [],
      relay: values.relay || existing?.relay || DEFAULT_RELAY,
      agent,
      permissions,
      name: values.name || existing?.name || os.hostname().replace(/\.local$/, ""),
      workspace: path.resolve(values.workspace || existing?.workspace || path.join(home, "workspace")),
      primed: existing?.agent === agent ? existing?.primed : false,
    };
    config = newPairing(config);
    fs.mkdirSync(config.workspace, { recursive: true });
    saveConfig(config);
    console.log(`Set up ${config.name}: agent ${agent}, workspace ${config.workspace}`);
    if (permissions === "approve-all") {
      console.log("Note: the agent runs with every permission request approved (--permissions approve-all). Use");
      console.log("--permissions approve-reads to deny writes and commands instead.");
    }
    printPairing(config);
    console.log("Start the daemon with: open-muse-bot start --detach");
    return;
  }

  const config = loadConfig();
  if (!config && command !== "help") throw new Error("Not set up yet. Run: open-muse-bot setup");

  if (command === "pair") {
    const next = newPairing(config);
    saveConfig(next);
    printPairing(next);
  } else if (command === "start") {
    const pid = running();
    if (pid && pid !== process.pid) return console.log(`Already running (pid ${pid}).`);
    if (values.detach) {
      const out = fs.openSync(paths.log, "a");
      const child = spawn(process.execPath, [process.argv[1], "start"], { detached: true, stdio: ["ignore", out, out] });
      child.unref();
      fs.writeFileSync(paths.pid, String(child.pid));
      console.log(`Started in the background (pid ${child.pid}). Log: ${paths.log}`);
      return;
    }
    fs.writeFileSync(paths.pid, String(process.pid));
    const stamp = () => new Date().toISOString();
    await runDaemon({ log: (m) => console.log(`${stamp()} ${m}`) });
  } else if (command === "stop") {
    const pid = running();
    if (!pid) return console.log("Not running.");
    process.kill(pid);
    console.log(`Stopped (pid ${pid}).`);
  } else if (command === "status") {
    console.log(`computer:   ${config.name} (${config.computerId})`);
    console.log(`agent:      ${config.agent}, permissions ${config.permissions}`);
    console.log(`workspace:  ${config.workspace}`);
    console.log(`relay:      ${config.relay}`);
    console.log(`devices:    ${config.devices.length ? config.devices.map((d) => d.name).join(", ") : "none paired"}`);
    console.log(`daemon:     ${running() ? `running (pid ${running()})` : "stopped"}`);
  } else {
    console.log(`open-muse-bot: turn your local agent into a personal agent you use from your phone

  open-muse-bot setup [--agent claude] [--relay URL] [--workspace DIR] [--permissions approve-all|approve-reads|deny-all]
  open-muse-bot start [--detach]   run the daemon
  open-muse-bot pair               new pairing code for another device
  open-muse-bot status
  open-muse-bot stop

Agents (through acpx): ${AGENTS.join(", ")}`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
