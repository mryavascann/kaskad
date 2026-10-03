"use client";

import { createWalletClient, custom, numberToHex, type Address, type Hex, type LocalAccount, type TransactionReceipt } from "viem";
import { monadTestnet } from "viem/chains";
import { DEFAULT_SIGNER, DEV_SIGNERS } from "../chain/signer-mode";
import { ensureFunded, getBurner, publicClient, sendBurnerTx } from "./burner";
import type { PasskeyKeys } from "./passkey-keys";
import { MAX_FEE_PER_GAS, MAX_PRIORITY_FEE_PER_GAS, sendRawSync } from "./tx";

// Who signs the app's transactions. Production: a Mera passkey wallet, its gas paid by the sponsor
// (lib/chain/signer-mode.ts). Development builds (NEXT_PUBLIC_DEV_SIGNERS=1) also offer the
// sponsored in-browser burner and the browser wallet, which pays its own testnet MON.

export type SignerKind = "burner" | "injected" | "mera";
type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

type SignerState = { kind: SignerKind; address: Address | null };

let state: SignerState = { kind: DEFAULT_SIGNER, address: null };
let meraAccount: LocalAccount | null = null;
let endMeraSession: (() => void) | null = null;
/** Private-watchlist keys from the same passkey (passkey-keys.ts); memory only, gone on sign-out. */
let meraKeys: PasskeyKeys | null = null;
let meraNonce: number | null = null;
let meraQueue: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();

function set(next: SignerState) {
  state = next;
  listeners.forEach((l) => l());
}

export const signerStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get(): SignerState {
    if (state.kind === "burner" && !state.address) state = { kind: "burner", address: getBurner().address };
    return state;
  },
  server(): SignerState {
    return { kind: DEFAULT_SIGNER, address: null };
  },
};

/** Development builds only: production never creates a burner key. */
export function selectBurner() {
  if (!DEV_SIGNERS) return;
  set({ kind: "burner", address: getBurner().address });
}

function injected(): Eip1193 {
  const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum;
  if (!eth) throw new Error("Tarayıcı cüzdanı bulunamadı (MetaMask, Rabby…).");
  return eth;
}

/** Connects the browser wallet and makes sure it is on Monad testnet (adds the chain if missing). Development builds only. */
export async function connectInjected(): Promise<Address> {
  if (!DEV_SIGNERS) throw new Error("Tarayıcı cüzdanı bulunamadı (MetaMask, Rabby…).");
  const eth = injected();
  const [addr] = (await eth.request({ method: "eth_requestAccounts" })) as Address[];
  if (!addr) throw new Error("Hesap seçilmedi.");
  await ensureMonadChain(eth);
  set({ kind: "injected", address: addr });
  return addr;
}

async function ensureMonadChain(eth: Eip1193) {
  const hex = numberToHex(monadTestnet.id);
  if ((await eth.request({ method: "eth_chainId" })) === hex) return;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
  } catch {
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hex,
          chainName: "Monad Testnet",
          nativeCurrency: monadTestnet.nativeCurrency,
          rpcUrls: monadTestnet.rpcUrls.default.http,
          blockExplorerUrls: ["https://testnet.monadscan.com"],
        },
      ],
    });
  }
}

export async function connectMeraSigner(mode: "login" | "create"): Promise<Address> {
  const { connectMeraSession } = await import("./mera");
  const next = await connectMeraSession(mode);
  endMeraSession?.(); // a new passkey replaces the previous session
  meraAccount = next.account;
  endMeraSession = next.end;
  meraKeys = next.keys;
  meraNonce = null;
  set({ kind: "mera", address: meraAccount.address });
  return meraAccount.address;
}

/**
 * Sign out: zeroes the passkey session's key copy and forgets the account. Signing in again asks for
 * the passkey. (Reloading the page does the same: the key only ever lived in memory.)
 */
export function signOutMera() {
  endMeraSession?.();
  endMeraSession = null;
  meraAccount = null;
  meraKeys = null;
  meraNonce = null;
  set({ kind: DEFAULT_SIGNER, address: null });
}

/** The signed-in passkey's watchlist keys, or null when nobody is signed in. */
export const getMeraKeys = (): PasskeyKeys | null => meraKeys;

/** Fetches the Mera SDK ahead of the click, so the passkey prompt follows the gesture without a wait. */
export const preloadMera = (): Promise<unknown> => import("./mera");

/** One button for both cases: sign in with the passkey this browser remembers, or make the first one. */
export async function signInMera(): Promise<Address> {
  const { hasStoredMeraPasskey } = await import("./mera");
  return connectMeraSigner(hasStoredMeraPasskey() ? "login" : "create");
}

export type Sent = { receipt: TransactionReceipt; ms: number; sync: boolean };

async function needBalance(address: Address, gas: bigint) {
  const need = gas * MAX_FEE_PER_GAS;
  const bal = await publicClient.getBalance({ address });
  if (bal < need) {
    throw new Error(
      `Bakiye yetersiz: ${(Number(bal) / 1e18).toFixed(3)} MON var, bu işlem için ${(Number(need) / 1e18).toFixed(3)} MON gerekli (testnet faucet: faucet.monad.xyz).`,
    );
  }
}

/** Sends one app transaction with the active signer. Gas and fees are fixed (Monad charges the limit). */
export async function sendTx(to: Address, data: Hex, gas: bigint, onStatus: (s: string) => void): Promise<Sent> {
  const s = signerStore.get();

  if (s.kind === "burner") {
    await ensureFunded(gas * MAX_FEE_PER_GAS, onStatus);
    onStatus("Gönderiliyor (eth_sendRawTransactionSync)…");
    return sendBurnerTx(to, data, gas);
  }

  if (s.kind === "mera") {
    if (!meraAccount) throw new Error("Mera oturumu kapalı: Cüzdan sekmesinden yeniden giriş yap.");
    const acct = meraAccount;
    // The sponsor tops up the passkey address like the burner's: it only sends gas, it never holds a key.
    await ensureFunded(gas * MAX_FEE_PER_GAS, onStatus, acct.address);
    onStatus("Mera ile imzalanıyor ve gönderiliyor (eth_sendRawTransactionSync)…");
    const job = meraQueue.then(async () => {
      if (meraNonce === null) meraNonce = await publicClient.getTransactionCount({ address: acct.address, blockTag: "pending" });
      const raw = await acct.signTransaction({
        chainId: monadTestnet.id,
        type: "eip1559",
        to,
        data,
        gas,
        nonce: meraNonce,
        maxFeePerGas: MAX_FEE_PER_GAS,
        maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
      });
      try {
        const r = await sendRawSync(publicClient, raw);
        meraNonce!++;
        return r;
      } catch (e) {
        meraNonce = null;
        throw e;
      }
    });
    meraQueue = job.catch(() => undefined);
    return job;
  }

  // browser wallet: it signs and broadcasts; we wait for the receipt
  const eth = injected();
  await ensureMonadChain(eth);
  await needBalance(s.address!, gas);
  onStatus("Cüzdanında onayla…");
  const wallet = createWalletClient({ chain: monadTestnet, transport: custom(eth) });
  const t0 = Date.now();
  const hash = await wallet.sendTransaction({
    account: s.address!,
    to,
    data,
    gas,
    maxFeePerGas: MAX_FEE_PER_GAS,
    maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
  });
  onStatus("Zincirde onay bekleniyor…");
  const receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 300, timeout: 60_000 });
  return { receipt, ms: Date.now() - t0, sync: false };
}

export const signerLabel: Record<SignerKind, string> = {
  burner: "Geçici cüzdan (sponsorlu)",
  injected: "Tarayıcı cüzdanı",
  mera: "Mera passkey",
};
