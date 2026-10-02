// Which signers this build offers. Production: Mera is the whole account layer (a passkey derives the
// key; no seed phrase, no extension, no key on the server), and the sponsor pays its gas. Development
// builds can bring back the in-browser burner and the browser wallet with NEXT_PUBLIC_DEV_SIGNERS=1.
// No runtime imports: lib/kaskad/signer.ts and the light lib/chain wrappers both read this.

import type { SignerKind } from "@/lib/kaskad/signer";

/** NEXT_PUBLIC_DEV_SIGNERS=1: burner and browser wallet next to Mera (development only). */
export const DEV_SIGNERS = process.env.NEXT_PUBLIC_DEV_SIGNERS === "1";

/** The signer every page load starts with. */
export const DEFAULT_SIGNER: SignerKind = DEV_SIGNERS ? "burner" : "mera";

/** Signer kinds this build lets the reader pick. */
export const ENABLED_SIGNERS: readonly SignerKind[] = DEV_SIGNERS ? ["burner", "injected", "mera"] : ["mera"];
