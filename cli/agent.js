// Runs the local agent through acpx (Agent Client Protocol), one turn per user message, in one named
// session ("main") inside the workspace folder. acpx prints the ACP JSON-RPC traffic as NDJSON with
// --format json; we read the agent's text chunks, tool calls and the final stop reason from it.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import readline from "node:readline";

const require = createRequire(import.meta.url);

function acpxBin() {
  const pkg = require.resolve("acpx/package.json");
  const { bin } = require("acpx/package.json");
  const rel = typeof bin === "string" ? bin : bin.acpx;
  return path.join(path.dirname(pkg), rel);
}

const PERMISSION_FLAGS = {
  "approve-all": ["--approve-all"],
  "approve-reads": ["--approve-reads", "--non-interactive-permissions", "deny"],
  "deny-all": ["--deny-all"],
};

export const SYSTEM_PROMPT = `You are the user's personal agent, reached through the Open Muse Bot app on their phone.
Be warm, brief and useful, like a capable assistant texting back. Your working folder is the user's agent workspace.

Custom tabs: the app shows a bottom tab for every folder in ./tabs that has an index.html. To build the user a
dashboard, tracker or feed, write ./tabs/<id>/index.html (one self-contained HTML page: inline CSS and JS, libraries
from a CDN are fine, made for a phone screen) and ./tabs/<id>/tab.json ({"title": "Short name"}). Put the page's data in
./tabs/<id>/data.json: the app hands it to the page as window.TAB_DATA, so the page reads it from there instead of
fetching. To refresh a dashboard later, rewrite data.json. Tell the user when a tab is ready.

Cards: to show the user a card with buttons, put a fenced block in your reply:
\`\`\`omb-card
{"title": "…", "body": "…", "actions": [{"label": "Open", "url": "https://…"}, {"label": "Do it", "prompt": "message to send me"}]}
\`\`\`
`;

/**
 * Runs one turn. Calls onText(fullTextSoFar), onActivity(label|null); resolves to { text, stopReason, error }.
 */
export function runTurn({ agent, workspace, permissions, prompt, primed, onText, onActivity, onSpawn }) {
  const args = [acpxBin(), "--cwd", workspace, "--format", "json", ...(PERMISSION_FLAGS[permissions] || PERMISSION_FLAGS["approve-all"])];
  if (agent === "claude") args.push("--append-system-prompt", SYSTEM_PROMPT);
  args.push(agent, "-s", "main", "-f", "-");
  const text = agent !== "claude" && !primed ? `${SYSTEM_PROMPT}\n---\n\n${prompt}` : prompt;

  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: workspace, stdio: ["pipe", "pipe", "pipe"] });
    onSpawn?.(child);
    let reply = "";
    let stopReason = null;
    let error = null;
    let stderr = "";
    child.stdin.end(text);
    child.stderr.on("data", (d) => {
      stderr = (stderr + d).slice(-4000);
    });
    readline.createInterface({ input: child.stdout }).on("line", (line) => {
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      const update = msg.method === "session/update" ? msg.params?.update : null;
      if (update?.sessionUpdate === "agent_message_chunk" && update.content?.type === "text") {
        reply += update.content.text;
        onText(reply);
      } else if (update?.sessionUpdate === "tool_call") {
        onActivity(update.title || update.kind || "Working");
      } else if (update?.sessionUpdate === "tool_call_update" && update.status === "completed") {
        onActivity(null);
      } else if (msg.result?.stopReason) {
        stopReason = msg.result.stopReason;
      } else if (msg.error) {
        error = msg.error.message || "The agent failed";
      }
    });
    child.on("close", (code) => {
      if (!stopReason && !error && code !== 0) error = stderr.trim().split("\n").slice(-3).join("\n") || `acpx exited with ${code}`;
      resolve({ text: reply, stopReason, error });
    });
  });
}

/** Makes sure the named session exists (acpx keeps it under ~/.acpx, scoped to the workspace). */
export function ensureSession({ agent, workspace }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [acpxBin(), "--cwd", workspace, "--format", "json", agent, "sessions", "ensure", "--name", "main"], {
      cwd: workspace,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ ok: code === 0, out }));
  });
}
