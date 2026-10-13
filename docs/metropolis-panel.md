# Metropolis submission copy archive

[Final submission record](submission/README.md) · [Project README](../README.md)

**Status: submitted and finalized on 13 October 2026 · Ready for judging.** The final Submit action was completed and the state persisted after reload; the entry had 6/6 submission fields and 8/8 award sections complete. Four required videos are published and linked below. No form completion or resubmission is pending.

This file preserves the English copy prepared for the entry. It is an editorial source archive, not a byte-for-byte export of the final portal content. The final delivery record is [submission-status.json](submission/submission-status.json); structured prepared copy is [panel-fields.json](submission/panel-fields.json).

## Final media

| Video | Final duration | Limit | Watch |
|---|---:|---:|---|
| Technical demo | 2:48 | 3:00 | [Published video](https://youtu.be/OZ5R2g6rRJo) |
| Pitch | 1:51 | 2:00 | [Published video](https://youtu.be/dxSGycde_b0) |
| Chainlink CRE | 1:32 | 2:00 | [Published video](https://youtu.be/BgLYiIOVSEA) |
| Perpl Risk Tool | 1:45 | 2:00 | [Published video](https://youtu.be/styCT_l5ayU) |

## Project and community

- **Project:** Kaskad.
- **Track:** Track 1 — Onchain Finance & Trading.
- **Team:** Marwa İpek and Rıfat Buğra Yavaşcan.
- **Community:** PRU Blockchain Community.
- **Repository:** https://github.com/mryavascann/kaskad
- **Live product:** https://kaskad42.vercel.app
- **Logo:** [submitted PNG](submission/kaskad-logo-1024.png) and [SVG source](submission/kaskad-logo.svg).

## One-line description

An on-chain risk engine that simulates lending liquidation cascades on Monad, verifiable by anyone.

## Project description

Kaskad answers a concrete risk question: what happens to a lending market if its collateral drops 3%? It simulates the full cascade—liquidations, collateral sales, price impact and further liquidations—in one transaction on Monad testnet, using recorded real Aave borrower books from Monad mainnet and Ethereum.

In the reference syrupUSDC book, a 3% shock leaves about $111M of debt below the liquidation threshold that instant-sale liquidators cannot profitably clear through the modeled DEX pool. At a 10% shock, valuing the remaining collateral at pool spot reveals about $8.8M of additional bad debt hidden by the oracle price. These are modeled outcomes on a recorded snapshot, not current market losses.

The app provides free previews, liquidation-wave analysis, Monte Carlo scenarios, a risk map and a historical replay of the 10 October 2025 ETH drawdown. A separate Perpl dashboard combines live Monad mainnet protocol and wallet views: liquidation levels, order-book depth, backstop demand, account positions and shock exposure. The console also links modeled exposure to snapshot borrower addresses, with public Nansen labels when available; unlabeled addresses remain unidentified.

RiskOracle makes the stress results usable by contracts. It runs four shocks, publishes reports and makes bounded LTV recommendations; GuardV2 pauses flagged demo markets and an ERC-4626 demo vault reallocates demo kUSD. A Chainlink CRE workflow orchestrates publish → guard refresh → vault rebalance. Its recorded end-to-end evidence uses CRE CLI broadcast simulations through a mock forwarder on Monad testnet.

Mera passkeys are the production account layer, with sponsored testnet gas. The same passkey PRF output also derives separate keys for an encrypted private watchlist. Envio HyperSync powers borrower discovery, with a resumable Monad RPC fallback. Server-side Alchemy RPC connections support mainnet reads and testnet proofs. Shared Redis quotas, RPC allowlists, sponsor payment limits and a reserve protect the public demo; a separate read-only tool tracks the sponsor budget.

The original engine and scale benchmarks were built for Monad Blitz Istanbul on 26 September 2026. Metropolis additions include the bilingual interface, Mera account and watchlist flows, risk map, hidden bad debt, risk-contract pipeline, CRE workflow, historical replay, Perpl protocol and wallet panels, Nansen exposure labels, and API/sponsor protection. The README links the corresponding merged PRs and on-chain evidence.

Live product: https://kaskad42.vercel.app
Code and evidence: https://github.com/mryavascann/kaskad

Aave books are recorded snapshots; a continuous keeper is not implemented. Public Nansen label availability depends on coverage and API credits. The guard and vault act on mock markets, not real Aave deposits.

## Proposed user acquisition plan

Our proposed first users are risk contributors at Monad lending protocols, vault builders deciding how much exposure to accept, and users reviewing concentrated collateral or liquidation risk.

We plan to begin with an open, read-only dashboard and reproducible case studies, using the syrupUSDC stress scenario and the historical Aave replay to invite technical feedback from Monad and DeFi builder communities. Each result should link to its input assumptions and, where available, a proof transaction so reviewers can challenge the model.

The next step is to recruit a small number of design partners for narrowly scoped pilots: compare Kaskad's signals with their existing monitoring, measure false alerts and missed risks, and test RiskOracle consumption in a sandbox before considering any use with real assets. For Perpl, we plan to validate the existing protocol and wallet views with traders and risk reviewers.

We would measure activation through completed scenario runs, repeat usage, reviewed proof transactions and pilot feedback rather than claiming adoption from page views. User acquisition and any paid API or monitoring offering would follow demonstrated usefulness and model validation. These are planned steps; we are not claiming signed customers, partnerships or production integrations.

## Reviewer access

Open https://kaskad42.vercel.app. No login is required for previews.

1. Home: inspect the syrupUSDC finding and risk map.
2. /app: use the syrupUSDC −3% scenario, then −10% for hidden bad debt. Open Who is exposed to inspect snapshot borrowers and available Nansen labels, and try Monte Carlo.
3. /guard: inspect the RiskOracle reports, demo market state and vault allocation.
4. /replay: review the 10 October 2025 comparison and its assumptions.
5. /perps: switch markets to inspect live Perpl liquidation and backstop risk. In Wallet risk on Perpl, enter a public address to inspect account positions and shock thresholds.
6. /wallet: sign in with a Mera passkey, look up an address and save an encrypted watchlist entry. Reopen it with the same passkey.
7. /how-it-works: open the recorded proof transactions.

For a new testnet proof, sign in with a Mera passkey on this exact hostname and choose Prove on chain. A browser/authenticator supporting WebAuthn PRF is required. The sponsor funds testnet gas when configured and funded; free previews and existing proof links remain available without signing.

Aave books are recorded snapshots; Perpl data is read live. Guard/vault actions use testnet mock markets and demo kUSD. CRE evidence is from CLI broadcast simulations, not a continuously deployed production workflow. Production watchlist persistence was verified by saving an entry and reopening it after a fresh passkey sign-in. The known syrupUSDC borrower list is cached; Nansen can return no public labels, and new queries require enough API credits.

## Envio

Kaskad uses Envio HyperSync to discover Aave borrowers from historical Borrow events, taking onBehalfOf as the borrower address. Block-pinned RPC/Multicall reads then reconstruct the borrower positions used by the cascade engine, so the event data drives the recorded books behind the console and risk map. The reference Monad snapshot contains 255 borrowers with debt at mainnet block 108,133,182. The implementation uses the official HyperSync client with a JSON HTTP fallback and now includes resumable, block-pinned Monad RPC borrower discovery as an alternative. The real HyperSync endpoint was verified on 13 October; a continuous HyperIndex/keeper pipeline is not implemented.

Code: https://github.com/mryavascann/kaskad/blob/main/scripts/src/lib/hypersync.ts
Pipeline: https://github.com/mryavascann/kaskad/blob/main/scripts/src/fetch-positions.ts
Demo: https://kaskad42.vercel.app/app

## Alchemy

Kaskad's provider setup uses Alchemy RPC endpoints for Monad mainnet position reads and Monad testnet previews, proof transactions and sponsor top-ups. The browser calls the project's server routes, keeping authenticated provider URLs out of client code. Mainnet reads support the Aave address-risk view and the live Perpl panel; the testnet proxy supports simulation and proof interactions. This is RPC infrastructure integration; we are not claiming an Alchemy account-abstraction or paymaster integration.

Mainnet reader: https://github.com/mryavascann/kaskad/blob/main/scripts/src/lib/chain.ts
RPC proxy: https://github.com/mryavascann/kaskad/blob/main/web/app/api/rpc/route.ts
Sponsor route: https://github.com/mryavascann/kaskad/blob/main/web/app/api/fund/route.ts

## Chainlink CRE

Kaskad uses Chainlink CRE to orchestrate its on-chain risk pipeline through both a 15-minute cron trigger and Kaskad book-event triggers. The workflow reads the books and current risk-system state, previews the trigger shock, and sends a report only when its decision logic finds a needed change, while respecting the oracle cooldown. KaskadCREReceiver processes that report by attempting RiskOracle.publish, GuardV2.refresh and RiskVault.rebalance in order. We have recorded successful CRE CLI broadcast simulations through MockKeystoneForwarder on Monad testnet, including cron and book-event transactions, plus cooldown and steady-state runs that send no report; we are not claiming a deployed production CRE workflow.

Guide and logs: https://github.com/mryavascann/kaskad/tree/main/cre
Workflow: https://github.com/mryavascann/kaskad/blob/main/cre/kaskad-risk/workflow.ts
Cron proof: https://testnet.monadscan.com/tx/0x07161a3ab2b540af3e1177e40161027893e800a9551df37bb019f8e38f89c5b5
Book-event proof: https://testnet.monadscan.com/tx/0xd7249a005920b4769d98789991c62857f90601dfa474a1c4d7692608716055db

## Mera UX

Mera is Kaskad's entire production account layer: a passkey derives the signing key, with no seed phrase or wallet extension required. The user signs in with the passkey and then confirms an on-chain proof, while the sponsor sends testnet MON to that account for gas rather than signing for the user. The signing key is held in the browser session and signing out ends that session; unsupported browsers can still use free previews. Burner and injected-wallet choices are behind a development-only flag that must not be enabled in production.

Passkey integration: https://github.com/mryavascann/kaskad/blob/main/web/lib/kaskad/mera.ts
Production signer mode: https://github.com/mryavascann/kaskad/blob/main/web/lib/chain/signer-mode.ts
Merged work: https://github.com/mryavascann/kaskad/pull/4
Demo: https://kaskad42.vercel.app/app

## Mera PRF

Kaskad uses the same Mera WebAuthn PRF output for non-account work: HKDF-SHA-256 with separate labels derives an AES-256-GCM watchlist encryption key, an opaque storage ID and a write token. Watched addresses, labels and alert thresholds are encrypted in the browser, while the storage service receives ciphertext and stores a hash of the write token. The watchlist can therefore be reopened with the same passkey without placing the plaintext list in server storage; explicit risk lookups still send the queried address to the position API. Production persistence uses Upstash/Vercel KV, and the endpoint reports unconfigured rather than silently using transient storage if production KV is missing. On 13 October we verified a saved public-address entry and updated alert threshold surviving a page reload and a fresh sign-in with the same passkey.

Key derivation: https://github.com/mryavascann/kaskad/blob/main/web/lib/kaskad/passkey-keys.ts
Watchlist API: https://github.com/mryavascann/kaskad/blob/main/web/app/api/watchlist/route.ts
Merged work: https://github.com/mryavascann/kaskad/pull/5
Demo: https://kaskad42.vercel.app/wallet

## Nansen

Kaskad integrates Nansen's standard address-label endpoint on the server to add public context to the console's Who is exposed view. For supported recorded borrower books, the view maps simulated liquidation exposure back to snapshot addresses and queries up to 60 of the largest borrowers, caching labels for seven days. Shared quotas and address locks limit duplicate upstream requests; keys stay on the server, and credit exhaustion is shown separately from an invalid key. We verified the real API and the deployed Monad borrower view on 13 October. The checked Monad addresses currently return no public standard labels, so the app leaves them unidentified rather than inventing owners; this is not a premium Smart Money integration.

Server integration: https://github.com/mryavascann/kaskad/blob/main/web/app/api/labels/labels.ts
Exposure mapping: https://github.com/mryavascann/kaskad/blob/main/web/lib/chain/exposure.ts
Merged work: https://github.com/mryavascann/kaskad/pull/17
Demo: https://kaskad42.vercel.app/app

## Perpl Analytics / Risk Tool

The dashboard combines protocol liquidation levels, order-book depth, backstop analysis, and public-wallet positions and shock thresholds. Wallet shock totals measure notional crossing thresholds, not predicted realized losses. The entry covers analytics rather than a hedge bot.

[Live dashboard](https://kaskad42.vercel.app/perps) · [Final walkthrough](https://youtu.be/styCT_l5ayU).

## Finalization and scope

The earlier draft-save state and missing-video checklist were superseded by the finalized submission on 13 October 2026. Technical and pitch publication preferences were present in the verified final entry. No additional permission or award outcome is inferred here.

The planned customer-acquisition steps above remain proposals, not signed customers or partnerships. Continuous Envio HyperIndex/keeper operation and a production CRE deployment remain future engineering work. For current documentation and operating boundaries, use the [technical reference](TECHNICAL-REFERENCE.md) and [development guide](DEVELOPMENT.md).
