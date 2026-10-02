// "One passkey, many keys". The Mera sign-in yields one 32-byte WebAuthn PRF output; the wallet key
// comes from it (mera.ts), and so do these, each with HKDF-SHA-256 under its own label, so none of
// them reveals the others or the wallet address:
//   encrypt     AES-256-GCM key (non-extractable) for the private watchlist, sealed in the browser
//   id          anonymous storage id: the server files the sealed watchlist under it
//   writeToken  proves the writer owns that id; the server keeps only its SHA-256
// Same idea as Mera's own secret vault (HKDF info "mera.v1.encrypt.secret"), with labels of our own.
// Web Crypto only, no imports: runs in the browser and in Node tests.

export const PASSKEY_KEY_INFO = {
  encrypt: "kaskad.v1.watchlist.encrypt",
  id: "kaskad.v1.watchlist.id",
  write: "kaskad.v1.watchlist.write",
} as const;

/** Additional data bound into every sealed blob: a blob made for something else does not open here. */
const SEAL_AAD = "kaskad.v1.watchlist";

export type PasskeyKeys = {
  /** AES-256-GCM, non-extractable; only seal() / open() use it. */
  encrypt: CryptoKey;
  /** 64 hex chars; reveals nothing about the passkey or the wallet. */
  id: string;
  /** 64 hex chars; sent only with writes. */
  writeToken: string;
};

/** A sealed value as stored on the server: version, AES-GCM nonce and ciphertext (with tag), base64url. */
export type SealedBlob = { v: 1; nonce: string; ct: string };

const te = new TextEncoder();
const td = new TextDecoder();

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

export function toBase64Url(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error("invalid base64url");
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Derives the watchlist keys from a Mera PRF output (exactly 32 bytes). The input is not kept. */
export async function derivePasskeyKeys(prfOutput: Uint8Array): Promise<PasskeyKeys> {
  if (prfOutput.length !== 32) throw new Error("PRF output must be 32 bytes");
  const copy = new Uint8Array(prfOutput);
  try {
    const material = await crypto.subtle.importKey("raw", copy, "HKDF", false, ["deriveKey", "deriveBits"]);
    const params = (info: string): HkdfParams => ({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: te.encode(info) });
    const encrypt = await crypto.subtle.deriveKey(params(PASSKEY_KEY_INFO.encrypt), material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    const id = hex(new Uint8Array(await crypto.subtle.deriveBits(params(PASSKEY_KEY_INFO.id), material, 256)));
    const writeToken = hex(new Uint8Array(await crypto.subtle.deriveBits(params(PASSKEY_KEY_INFO.write), material, 256)));
    return { encrypt, id, writeToken };
  } finally {
    copy.fill(0);
  }
}

/** Encrypts a JSON value with a fresh 96-bit nonce. */
export async function seal(key: CryptoKey, value: unknown): Promise<SealedBlob> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: te.encode(SEAL_AAD) }, key, te.encode(JSON.stringify(value)));
  return { v: 1, nonce: toBase64Url(nonce), ct: toBase64Url(new Uint8Array(ct)) };
}

/** Decrypts a sealed blob; throws when it was tampered with or sealed under another key. */
export async function open(key: CryptoKey, blob: SealedBlob): Promise<unknown> {
  if (blob.v !== 1) throw new Error("unknown sealed blob version");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(blob.nonce), additionalData: te.encode(SEAL_AAD) },
    key,
    fromBase64Url(blob.ct),
  );
  return JSON.parse(td.decode(plain));
}
