// The computer's side of the relay: one outgoing WebSocket to the relay's Durable Object for this computer,
// reconnected with backoff. The relay forwards sealed frames between this socket and the paired devices.

export function relaySocketUrl(relay, computerId, query) {
  const url = new URL(relay);
  url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
  url.pathname = "/ws/host";
  url.search = new URLSearchParams({ c: computerId, ...query }).toString();
  return url.toString();
}

export function connectRelay({ relay, computerId, token, onFrame, onState, log }) {
  let ws = null;
  let attempt = 0;
  let stopped = false;
  let pingTimer = null;

  let retried = false;
  function retry(socket, reason) {
    if (retried || stopped) return;
    retried = true;
    clearInterval(pingTimer);
    onState(false);
    try {
      socket.close();
    } catch {
      // already closed
    }
    const wait = Math.min(30_000, 1000 * 2 ** attempt++) + Math.random() * 500;
    log(`relay connection lost (${reason}); retrying in ${Math.round(wait / 1000)}s`);
    setTimeout(open, wait);
  }

  function open() {
    if (stopped) return;
    retried = false;
    const socket = new WebSocket(relaySocketUrl(relay, computerId, { t: token }));
    ws = socket;
    let lastPong = Date.now();
    // A handshake that never finishes (e.g. the relay restarting mid-connect) would otherwise hang forever.
    const connectTimer = setTimeout(() => socket.readyState !== 1 && retry(socket, "connect timeout"), 15_000);
    socket.addEventListener("open", () => {
      clearTimeout(connectTimer);
      attempt = 0;
      onState(true);
      log(`connected to relay ${relay}`);
      clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        if (Date.now() - lastPong > 75_000) return retry(socket, "no pong");
        if (socket.readyState === 1) socket.send("ping");
      }, 30_000);
    });
    socket.addEventListener("message", (event) => {
      if (event.data === "pong") {
        lastPong = Date.now();
        return;
      }
      try {
        onFrame(JSON.parse(event.data));
      } catch {
        // not ours
      }
    });
    socket.addEventListener("close", (event) => {
      clearTimeout(connectTimer);
      if (event.code === 4001) log("the relay refused this computer's token (another install claimed this computer id?)");
      retry(socket, `closed ${event.code}`);
    });
    socket.addEventListener("error", () => {
      // close follows
    });
  }

  open();
  return {
    send(frame) {
      if (ws?.readyState === 1) ws.send(JSON.stringify(frame));
    },
    stop() {
      stopped = true;
      clearInterval(pingTimer);
      ws?.close();
    },
  };
}
