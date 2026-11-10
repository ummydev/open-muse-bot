// NaCl box between this device and the paired computer. Pure JS so it runs the same on iOS, Android and web.
import nacl from "tweetnacl";

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function b64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += ALPHA[(n >> 18) & 63] + ALPHA[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += ALPHA[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += ALPHA[n & 63];
  }
  return out;
}

export function unb64(text: string): Uint8Array {
  const clean = text.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buf = 0;
  let bits = 0;
  let j = 0;
  for (const ch of clean) {
    const v = ALPHA.indexOf(ch);
    if (v < 0) throw new Error("bad base64");
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (buf >> bits) & 255;
    }
  }
  return out.slice(0, j);
}

export function utf8(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    let c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
}

export function fromUtf8(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    let c: number;
    if (b < 0x80) (c = b), (i += 1);
    else if (b < 0xe0) (c = ((b & 31) << 6) | (bytes[i + 1] & 63)), (i += 2);
    else if (b < 0xf0) (c = ((b & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63)), (i += 3);
    else (c = ((b & 7) << 18) | ((bytes[i + 1] & 63) << 12) | ((bytes[i + 2] & 63) << 6) | (bytes[i + 3] & 63)), (i += 4);
    out += String.fromCodePoint(c);
  }
  return out;
}

export type Keys = { publicKey: string; secretKey: string };

export function newKeys(): Keys {
  const kp = nacl.box.keyPair();
  return { publicKey: b64(kp.publicKey), secretKey: b64(kp.secretKey) };
}

export function seal(value: unknown, theirKey: string, mySecret: string) {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const box = nacl.box(utf8(JSON.stringify(value)), nonce, unb64(theirKey), unb64(mySecret));
  return { n: b64(nonce), b: b64(box) };
}

export function open<T = any>(frame: { n: string; b: string }, theirKey: string, mySecret: string): T | null {
  try {
    const plain = nacl.box.open(unb64(frame.b), unb64(frame.n), unb64(theirKey), unb64(mySecret));
    return plain ? JSON.parse(fromUtf8(plain)) : null;
  } catch {
    return null;
  }
}

export type Pairing = { v: 1; r: string; c: string; k: string; s: string; n?: string };

/** Accepts a pairing code (omb1.…) or a link that carries one (…#pair=omb1.…). */
export function parsePairing(input: string): Pairing | null {
  const match = input.trim().match(/omb1\.([A-Za-z0-9_-]+)/);
  if (!match) return null;
  try {
    const p = JSON.parse(fromUtf8(unb64(match[1])));
    return p && p.v === 1 && p.r && p.c && p.k && p.s ? p : null;
  } catch {
    return null;
  }
}
