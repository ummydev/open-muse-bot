// End-to-end check that plays the phone: pairs with a pairing code, sends one message and prints the reply.
//   node scripts/device-test.mjs <pairing code> "message"
import nacl from "tweetnacl";

const [code, text = "Reply with exactly: pong"] = process.argv.slice(2);
if (!code?.startsWith("omb1.")) throw new Error("usage: device-test.mjs <omb1.… pairing code> [message]");
const pair = JSON.parse(Buffer.from(code.slice(5), "base64url").toString());
const kp = nacl.box.keyPair();
const b64 = (u) => Buffer.from(u).toString("base64url");
const unb64 = (s) => new Uint8Array(Buffer.from(s, "base64url"));
const url = new URL(pair.r);
url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
url.pathname = "/ws/device";
url.search = new URLSearchParams({ c: pair.c, k: b64(kp.publicKey) }).toString();

const ws = new WebSocket(url);
const send = (value) => {
  const nonce = nacl.randomBytes(24);
  const box = nacl.box(new TextEncoder().encode(JSON.stringify(value)), nonce, unb64(pair.k), kp.secretKey);
  ws.send(JSON.stringify({ t: "msg", n: b64(nonce), b: b64(box) }));
};
const timer = setTimeout(() => {
  console.error("timed out");
  process.exit(1);
}, 180_000);

ws.addEventListener("open", () => send({ t: "pair", s: pair.s, name: "device-test" }));
ws.addEventListener("message", (event) => {
  const frame = JSON.parse(event.data);
  if (frame.t === "presence") return console.log("presence:", frame.online);
  const msg = JSON.parse(new TextDecoder().decode(nacl.box.open(unb64(frame.b), unb64(frame.n), unb64(pair.k), kp.secretKey)));
  if (msg.t === "paired") console.log("paired with", msg.computer);
  else if (msg.t === "state") {
    console.log(`state: ${msg.messages.length} messages, ${msg.tabs.length} tabs, agent ${msg.agent}`);
    send({ t: "send", id: "test1", text });
  } else if (msg.t === "busy") console.log("busy:", msg.busy, msg.activity ?? "");
  else if (msg.t === "upsert" && msg.message.role === "assistant" && !msg.message.streaming) {
    console.log("reply:", msg.message.text || JSON.stringify(msg.message.cards), msg.message.error ?? "");
    clearTimeout(timer);
    ws.close();
  } else if (msg.t === "error") {
    console.error("error:", msg.message);
    process.exit(1);
  }
});
