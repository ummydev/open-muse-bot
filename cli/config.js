// Where the computer keeps its identity, settings, chat history and paired devices: ~/.open-muse-bot
// (OPEN_MUSE_BOT_HOME overrides it). Nothing here ever leaves this computer unencrypted.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_RELAY = "https://open-muse-bot.supercooldevs.workers.dev";

export const home = process.env.OPEN_MUSE_BOT_HOME || path.join(os.homedir(), ".open-muse-bot");
export const paths = {
  config: path.join(home, "config.json"),
  history: path.join(home, "history.json"),
  log: path.join(home, "daemon.log"),
  pid: path.join(home, "daemon.pid"),
};

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export function loadConfig() {
  return readJson(paths.config, null);
}

export function saveConfig(config) {
  writeJson(paths.config, config);
}

export function loadHistory() {
  return readJson(paths.history, []);
}

export function saveHistory(messages) {
  writeJson(paths.history, messages.slice(-500));
}
