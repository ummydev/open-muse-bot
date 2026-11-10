import { DurableObject } from "cloudflare:workers";

// The relay. One Durable Object per computer holds the computer's socket and its devices' sockets and forwards
// sealed frames between them. It can't read them: they're NaCl boxes between the computer's key and each
// device's key. It stores one thing: a hash of the computer's token, set by the first computer to connect.
//
//   GET /ws/host?c=<computerId>&t=<token>      the computer's daemon
//   GET /ws/device?c=<computerId>&k=<devicePublicKey>   a phone or browser
//
// Frames (JSON text): device → {t:"msg", n, b}; the computer gets {t:"msg", k, n, b} (k = the device's key) and
// answers {t:"msg", to: <device key>, n, b}. Devices also get {t:"presence", online} for the computer.
// Everything else is served from the web app's static build.

interface Env {
  COMPUTER: DurableObjectNamespace<Computer>;
  ASSETS: Fetcher;
}

const KEY = /^[A-Za-z0-9_-]{43}$/;
const ID = /^[A-Za-z0-9_-]{16,64}$/;

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class Computer extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    const [client, server] = Object.values(new WebSocketPair());
    if (url.pathname === "/ws/host") {
      const token = url.searchParams.get("t") ?? "";
      if (token.length < 32) return new Response("Bad token", { status: 400 });
      const hash = await sha256(token);
      const known = await this.ctx.storage.get<string>("tokenHash");
      if (known && known !== hash) {
        this.ctx.acceptWebSocket(server, ["rejected"]);
        server.close(4001, "token");
        return new Response(null, { status: 101, webSocket: client });
      }
      if (!known) await this.ctx.storage.put("tokenHash", hash);
      for (const old of this.ctx.getWebSockets("host")) old.close(4009, "replaced");
      this.ctx.acceptWebSocket(server, ["host"]);
      this.presence(true);
    } else {
      const key = url.searchParams.get("k") ?? "";
      if (!KEY.test(key)) return new Response("Bad device key", { status: 400 });
      this.ctx.acceptWebSocket(server, ["device", `dev:${key}`]);
      server.serializeAttachment({ key });
      server.send(JSON.stringify({ t: "presence", online: this.hostOnline() }));
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;
    let frame: { t?: string; to?: string; n?: string; b?: string };
    try {
      frame = JSON.parse(message);
    } catch {
      return;
    }
    if (frame.t !== "msg" || typeof frame.n !== "string" || typeof frame.b !== "string") return;
    const [tag] = this.ctx.getTags(socket);
    if (tag === "host") {
      if (typeof frame.to !== "string" || !KEY.test(frame.to)) return;
      const text = JSON.stringify({ t: "msg", n: frame.n, b: frame.b });
      for (const device of this.ctx.getWebSockets(`dev:${frame.to}`)) this.trySend(device, text);
    } else if (tag === "device") {
      const { key } = socket.deserializeAttachment() as { key: string };
      const text = JSON.stringify({ t: "msg", k: key, n: frame.n, b: frame.b });
      const hosts = this.ctx.getWebSockets("host");
      if (hosts.length === 0) this.trySend(socket, JSON.stringify({ t: "presence", online: false }));
      for (const host of hosts) this.trySend(host, text);
    }
  }

  webSocketClose(socket: WebSocket) {
    const [tag] = this.ctx.getTags(socket);
    if (tag === "host" && !this.hostOnline(socket)) this.presence(false);
  }

  private hostOnline(except?: WebSocket) {
    return this.ctx.getWebSockets("host").some((s) => s !== except && s.readyState === WebSocket.OPEN);
  }

  private presence(online: boolean) {
    const text = JSON.stringify({ t: "presence", online });
    for (const device of this.ctx.getWebSockets("device")) this.trySend(device, text);
  }

  private trySend(socket: WebSocket, text: string) {
    try {
      socket.send(text);
    } catch {
      // closing
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/ws/host" || url.pathname === "/ws/device") {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
      const computerId = url.searchParams.get("c") ?? "";
      if (!ID.test(computerId)) return new Response("Bad computer id", { status: 400 });
      const stub = env.COMPUTER.get(env.COMPUTER.idFromName(computerId), { locationHint: "wnam" });
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
