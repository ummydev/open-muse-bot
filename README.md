# Open Muse Bot

Turn the coding agent you already have — Claude Code, Codex, Gemini CLI, and anything else that speaks the
[Agent Client Protocol](https://agentclientprotocol.com) — into a personal agent you use from your phone, on the
subscription you already pay for.

- **Chat with your agent from anywhere.** It keeps running on your Mac or VPS, with your files, tools and logins.
- **Tabs your agent builds for you.** Ask for "a dashboard of high-IV options" or "a daily briefing" and it writes a
  page that shows up as its own tab in the app.
- **Cards, not walls of text.** The agent can answer with cards and buttons (connect Gmail, try a suggestion…).
- **End-to-end encrypted.** The relay only forwards sealed bytes; your chats and tabs stay on your computer.
- **Free software (GPL-3.0), no account.** Pair your phone with a code; nothing to sign up for.

> Status: early MVP. Web app works today at **https://open-muse-bot.supercooldevs.workers.dev**; the same Expo code
> builds the iOS and Android apps (not in the stores yet).

## Quick start

On the computer where your agent runs (Node 22.13+):

```sh
npm install -g github:ummydev/open-muse-bot
open-muse-bot setup            # prints a pairing link + QR code
open-muse-bot start --detach   # runs the daemon in the background
```

Open the printed link on your phone (or paste the pairing code into the app) and say hi.

Or just tell Claude Code on that computer:

> Install Open Muse Bot with `npm install -g github:ummydev/open-muse-bot`, run `open-muse-bot setup`, then
> `open-muse-bot start --detach`, and show me the pairing link it printed.

Options:

```sh
open-muse-bot setup --agent codex                   # any agent acpx supports: claude, codex, gemini, cursor, opencode, kimi, …
open-muse-bot setup --workspace ~/agent             # the agent's working folder (default ~/.open-muse-bot/workspace)
open-muse-bot setup --permissions approve-reads     # approve-all (default) | approve-reads | deny-all
open-muse-bot pair                                  # a new pairing code for another device
open-muse-bot status | stop
```

`approve-all` lets the agent act without asking, which is what a personal agent on its own machine usually wants.
Run it on a computer (or VPS) you're comfortable giving the agent.

## How it works

```
 phone / browser ──wss──▶ Cloudflare Worker ──▶ Durable Object (one per computer) ◀──wss── open-muse-bot daemon
   (Expo app)                relay: forwards NaCl-sealed frames it can't read              │  acpx (ACP)
                                                                                              ▼
                                                                          Claude Code / Codex / … on your computer
```

- **`cli/`** — the daemon (Node). Pairs devices (X25519 keys + a one-time secret in the pairing code), keeps the chat
  history in `~/.open-muse-bot`, runs one agent turn per message through [acpx](https://github.com/openclaw/acpx) in a
  named session, streams the reply back, and watches `workspace/tabs/` for tabs the agent writes.
- **`relay/`** — a Cloudflare Worker + one Durable Object per computer. It holds the sockets and forwards sealed
  frames; the only thing it stores is a hash of the computer's token. It also serves the web app.
- **`app/`** — the client (Expo / React Native: iOS, Android, web). Chat, cards, and custom tabs rendered in a
  sandboxed WebView / iframe.

### Tabs

The agent creates a tab by writing:

```
workspace/tabs/<id>/index.html   one self-contained page made for a phone
workspace/tabs/<id>/tab.json     {"title": "Short name"}
workspace/tabs/<id>/data.json    optional; given to the page as window.TAB_DATA
```

To keep a dashboard fresh, have the agent (or a cron job) rewrite `data.json`; open tabs reload when it changes.

### Cards

The agent puts a fenced block in its reply:

````
```omb-card
{"title": "Connect Gmail", "body": "…", "actions": [{"label": "Connect", "url": "https://…"}, {"label": "Not now", "prompt": "…"}]}
```
````

## Self-hosting the relay

```sh
cd app && npm install && npx expo export -p web
cd ../relay && npm install && npx wrangler deploy
open-muse-bot setup --relay https://<your-worker>.workers.dev
```

## Development

```sh
npm install                      # CLI
cd relay && npm install && npx wrangler dev --port 8787
OPEN_MUSE_BOT_HOME=/tmp/omb node cli/bin.js setup --relay http://localhost:8787
OPEN_MUSE_BOT_HOME=/tmp/omb node cli/bin.js start
node scripts/device-test.mjs '<pairing code>' "hello"   # plays the phone end to end
cd app && npm install && npx expo start                  # the app (press w for web)
```

## Roadmap

Connect Gmail/Calendar in one tap (claude.ai connectors for Claude users, Composio Connect for others), scheduled
refresh for tabs, push notifications, approval cards for risky actions, QR scanning, store builds, a desktop app.

Open Muse Bot is an independent project, not affiliated with Meta, Anthropic or OpenAI.

## License

GPL-3.0-only. See [LICENSE](LICENSE).

The app's UI layout is adapted from [OpenMuse](https://github.com/CopilotKit/openmuse) (MIT); see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
