// End-to-end encryption between the computer and its paired devices: NaCl box (X25519 + XSalsa20-Poly1305).
// The relay only ever sees base64url ciphertext, nonces and public keys.
import nacl from "tweetnacl";

export function b64(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

export function unb64(text) {
  return new Uint8Array(Buffer.from(text, "base64url"));
}

export function newKeyPair() {
  const kp = nacl.box.keyPair();
  return { publicKey: b64(kp.publicKey), secretKey: b64(kp.secretKey) };
}

export function randomId(bytes = 16) {
  return b64(nacl.randomBytes(bytes));
}

/** Seals a JSON value for `theirPublicKey`. */
export function seal(value, theirPublicKey, mySecretKey) {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const box = nacl.box(plain, nonce, unb64(theirPublicKey), unb64(mySecretKey));
  return { n: b64(nonce), b: b64(box) };
}

/** Opens a sealed frame from `theirPublicKey`; null when it doesn't authenticate. */
export function open(frame, theirPublicKey, mySecretKey) {
  try {
    const plain = nacl.box.open(unb64(frame.b), unb64(frame.n), unb64(theirPublicKey), unb64(mySecretKey));
    if (!plain) return null;
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null;
  }
}
