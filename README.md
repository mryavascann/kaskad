# ▼ Kaskad

**What happens to Aave if a collateral asset drops 3%? Kaskad simulates the liquidation cascade on chain, in a single transaction.**

[Live demo](https://kaskad42.vercel.app) · [Simulation console](https://kaskad42.vercel.app/app) · [On-chain proofs](https://kaskad42.vercel.app/how-it-works) · [Türkçe — previous README](README.tr.md)

**Monad Metropolis · Track 1: Onchain Finance & Trading**

By **Marwa İpek** and **Rıfat Buğra Yavaşcan** · [MIT](LICENSE)

## In 30 seconds

Kaskad turns a collateral-price shock into a sequence of liquidations, collateral sales, price impact, and further liquidations. It reads real Aave borrower positions, packs each position into one storage slot, and runs the stress test on Monad. Anyone can preview a scenario for free or publish a verifiable result on Monad testnet.

The reference syrupUSDC book contains **57 positions and $123.7M of debt**. A simulated 3% drop leaves **$111.0M below the liquidation threshold but unable to exit profitably through the modeled DEX pool**. At a 10% drop, valuing the same remaining positions at the pool's spot price reveals **$8.8M of additional bad debt hidden by the oracle price**. These are scenario results on a recorded book, not current market losses.

The result can also drive contracts: **RiskOracle → GuardV2 → an ERC-4626 demo vault**. A Chainlink CRE workflow orchestrates the updates. The app adds a risk map, a historical replay, a live Perpl risk panel, and Mera passkey accounts with an encrypted watchlist.

**Network boundary:** Aave data comes from Monad mainnet and Ethereum; Kaskad's execution, proofs, circuit breakers, and demo vault are on **Monad testnet (chain ID 10143)**. The demo does not control Aave or move real Aave deposits.

## Try it

| Page | What to inspect |
|---|---|
| [Home](https://kaskad42.vercel.app) | The syrupUSDC finding and a risk map of 11 eligible books × five shocks. |
| [Console](https://kaskad42.vercel.app/app) | Change a shock, inspect liquidation waves and hidden bad debt, compare books, run Monte Carlo, then choose **Prove on chain**. |
| [Guard](https://kaskad42.vercel.app/guard) | Read RiskOracle's four stress reports, the markets' pause/LTV state, and the vault allocation. Publish, refresh, and rebalance have separate actions with cost estimates. |
| [10 October replay](https://kaskad42.vercel.app/replay) | Compare the engine with actual Aave liquidations during the 10–11 October 2025 ETH drawdown. |
| [Perps](https://kaskad42.vercel.app/perps) | Inspect Perpl liquidation levels, order-book absorption, backstop exposure, and insurance coverage. |
| [Wallet](https://kaskad42.vercel.app/wallet) | Check an address's Aave exposure and use the passkey-encrypted private watchlist. |
| [How it works](https://kaskad42.vercel.app/how-it-works) | Inspect the model and the transaction proof ledger. |

Previews need no sign-in. Production signing uses **Mera passkeys**: sign in, then confirm the on-chain action. The sponsor sends testnet MON to the passkey account for gas; the user's signing key stays in the browser session. Passkeys are hostname-bound and require WebAuthn PRF support. English is served at the root; Turkish starts at [`/tr`](https://kaskad42.vercel.app/tr).

## Built during Metropolis

Kaskad's initial cascade engine, recorded books, scale benchmarks, and original Guard demo were built for **Monad Blitz Istanbul, 26 September 2026**. The table separates that baseline from the subsequent Metropolis work. Dates below are merge dates in **Europe/Istanbul (UTC+3)**.

| Merged | PR | Added during Metropolis |
|---|---|---|
| 1 & 3 Oct 2026 | [#2](https://github.com/mryavascann/kaskad/pull/2), [#3](https://github.com/mryavascann/kaskad/pull/3) | New interface and English/Turkish routes. |
| 3 Oct 2026 | [#4](https://github.com/mryavascann/kaskad/pull/4) | Mera as the production account layer, sponsor-funded gas, and passkey-gated proofs. |
| 3 Oct 2026 | [#5](https://github.com/mryavascann/kaskad/pull/5) | PRF-derived encryption, anonymous storage ID, and write authorization for a private watchlist. |
| 3 Oct 2026 | [#6](https://github.com/mryavascann/kaskad/pull/6) | Risk map with a reference cell checked against an on-chain preview. |
| 3 Oct 2026 | [#7](https://github.com/mryavascann/kaskad/pull/7) | MIT license. |
| 3 Oct 2026 | [#8](https://github.com/mryavascann/kaskad/pull/8) | Hidden bad debt in the console and risk map. |
| 3 Oct 2026 | [#9](https://github.com/mryavascann/kaskad/pull/9) | KaskadMCv3, RiskOracle, GuardV2, RiskVault, testnet deployment, and Guard-page controls. |
| 4 Oct 2026 | [#10](https://github.com/mryavascann/kaskad/pull/10) | Chainlink CRE workflow, receiver, cron/book-event triggers, and broadcast simulation evidence. |
| 4 Oct 2026 | [#11](https://github.com/mryavascann/kaskad/pull/11) | Historical 10 October 2025 replay with archived Ethereum data. |
| 7 Oct 2026 | [#12](https://github.com/mryavascann/kaskad/pull/12) | Live Perpl liquidation and backstop risk panel. |

## What the model finds

The reference Monad Aave snapshot is pinned to **mainnet block 108,133,182**: approximately **$531.0M supplied**, **$238.8M borrowed**, and **255 borrowers with debt**. Total collateral held by those borrowers is a separate figure: **$268.6M**. Source metadata and per-asset depth assumptions are recorded in [`deployment.json`](web/lib/kaskad/deployment.json).

For the real syrupUSDC book, with 20 simulated blocks, up to three liquidation waves per block, and the external-price oracle:

| Collateral shock | Bad debt at oracle price | Debt stuck below the liquidation threshold | Additional hidden bad debt at pool spot |
|---|---:|---:|---:|
| −3% | $0 | $111.0M | ~$0.3M |
| −10% | ~$17.7K | $96.8M | $8.8M |
| −20% | $13.3M | ~$0.1M | $8.3M |

- **Stuck debt** is debt below the liquidation threshold whose collateral still covers the debt at the oracle price, but which an instant-sale liquidator cannot profitably clear in the model.
- **Bad debt** is the remaining shortfall when collateral is worth less than debt at the oracle price.
- **Hidden bad debt** is the additional shortfall when the remaining collateral is valued at the simulated pool spot price. It can overlap with positions counted as stuck; the three columns are not additive.

The recorded syrupUSDC DEX depth is about **$7.04M**. In the −3% scenario, liquidators repay only about **$134K** before further sales stop being profitable. Switching to the explicitly labeled worst case, where the oracle follows the pool, produces **$115.9M of bad debt** under the same initial shock. The snapshot's actual syrupUSDC oracle follows an exchange rate rather than the DEX spot price.

The risk map reads each book once and runs the engine's TypeScript replay for five shocks. It displays only after the reference syrupUSDC −3% cell agrees with an on-chain preview for stuck debt and bad debt to within $1; individual unreadable books may be omitted. This is a consistency check on one cell, not a separate proof transaction for every cell. See [`risk-map.ts`](web/lib/chain/risk-map.ts), [`replay.ts`](web/lib/chain/replay.ts), and their tests.

## Why Monad

The engine's data layout makes storage locality useful: one packed 32-byte position per slot, in consecutive book slots. Under [MIP-8](https://github.com/monad-crypto/MIPs/blob/main/MIPs/MIP-8.md), a full 128-slot page amortizes to **162.5 gas per read** (`100 + 8,000 / 128`), compared with **2,100 gas per cold slot read** in the Ethereum comparison. Memory pricing and the transaction gas budget also affect how many positions or scenarios fit in one call.

These are the **recorded Blitz baseline benchmarks**, preserved from the [previous README](README.tr.md). Monad runs used testnet; the Ethereum numbers were recorded from local execution of the same contract/book under Ethereum gas accounting, not Ethereum transactions. They are not new KaskadMCv3 benchmarks.

| Workload | Monad testnet | Ethereum comparison recorded at baseline |
|---|---:|---:|
| 10,000-position cascade | **17.7M engine gas**, ~1.6 MB memory; [proof transaction](https://testnet.monadscan.com/tx/0x661facb56395f553be94399d004f0ca75834cc2f5037f54d37adff832d6d185c) | 42.3M gas, ~2.52× the 16,777,216 transaction cap |
| 5,000-position cascade | 9.4M engine gas | 20.5M gas, ~1.22× that cap |
| Monte Carlo preview capacity, 57-position book, external / pool-following oracle | 213 / 57 scenarios | 114 / 34 scenarios |
| Submission to receipt, four recorded `eth_sendRawTransactionSync` calls | Mean 336 ms | Not measured |

The comparison uses a **30M Monad transaction budget** and the [EIP-7825](https://eips.ethereum.org/EIPS/eip-7825) Ethereum cap. The scale proof's event records **17,736,204 engine gas** and **1,628,672 bytes of memory**; its receipt reports **21,725,444 gas**. Engine gas and transaction-level gas are different measurements. Preview capacity is also distinct from a completed proof transaction: the recorded Monte Carlo proofs below contain **208 and 56 paths**, respectively. Receipt latency is an observation from those calls, not a finality guarantee.

The console's Ethereum gauge is a **rough estimate**, implemented in [`limits.ts`](web/lib/chain/limits.ts), rather than a fresh Ethereum benchmark. Local benchmark code is in [`GasBench.t.sol`](contracts/test/GasBench.t.sol) and [`Profile.t.sol`](contracts/test/Profile.t.sol); the historical measurement script is [`measure-all.ts`](scripts/src/measure-all.ts). That script sends transactions and spends testnet MON.

## How it works

```text
Monad mainnet / Ethereum Aave (read only)
  └─ Envio HyperSync borrower discovery + block-pinned RPC / Multicall
       └─ recorded books loaded into Kaskad on Monad testnet
            ├─ Kaskad: cascade + calibrated scale tests
            ├─ KaskadMC: arbitrage recovery + Monte Carlo
            └─ KaskadMCv3: cascade + hidden bad debt
                 └─ RiskOracle: four shocks + bounded LTV recommendation
                      └─ GuardV2: pause / reopen demo markets
                           └─ RiskVault: move demo kUSD away from flagged markets

Chainlink CRE cron / book event
  └─ read + preview + decide → report → forwarder → KaskadCREReceiver
       └─ publish → refresh GuardV2 → rebalance RiskVault

Perpl mainnet positions + public REST order book
  └─ server-side read → liquidation / backstop model → /perps
```

1. **Book:** each position is packed into one slot. A heap orders positions by liquidation price so each wave does not rescan every borrower.
2. **Cascade:** the engine applies the configured shock path, models Aave-style close factors and liquidation bonuses, sells seized collateral into a virtual constant-product pool, and stops a liquidator at break-even.
3. **Recovery and oracle:** KaskadMC models arbitrage between steps. External-price and pool-following oracle modes expose different feedback behavior.
4. **Risk feed:** `RiskOracle.publish(asset)` runs −1%, −3%, −10%, and −20% scenarios, stores their reports, and changes a recommended LTV by a bounded step. `GuardV2.refresh()` applies it to demo markets; `RiskVault.rebalance()` reallocates the demo vault.
5. **Orchestration:** the CRE workflow previews whether a report is needed and respects cooldowns. Its receiver attempts publish, guard refresh, and vault rebalance in order, logging failed steps without reverting the entire report.

The main console uses Kaskad/KaskadMC; the new RiskOracle pipeline uses KaskadMCv3. Public calls can trigger the risk pipeline, while configuration and book-loading permissions remain owner-controlled.

**CRE deployment status:** the recorded end-to-end runs use `cre workflow simulate --broadcast` with a **MockKeystoneForwarder on Monad testnet**. The workflow has cron and book-event triggers, but these logs do not establish a continuously deployed production workflow. See the [CRE guide and run logs](cre/README.md).

## Historical replay: 10 October 2025

The [replay page](https://kaskad42.vercel.app/replay) uses the TypeScript engine mirror on an archived **4,640-position WETH-dominant Aave V3 Ethereum book**, with **$1.78B debt** at block **23,549,825**. The Chainlink ETH/USD price fell from about $4,010.36 to $3,456.70 (**−13.81%**).

| Comparison for borrowers in that book | Kaskad replay | Observed Aave liquidations |
|---|---:|---:|
| Debt liquidated | $48.3M | $26.9M |
| Distinct positions | 283 | 158 |

The replay assumes borrowers do not react. Subsequent chain reads identified **121 predicted positions that repaid debt or added collateral**; removing their predicted volume gives about **$24.5M**, approximately 9% below the observed $26.9M. This is an **after-the-fact adjustment**, not the unadjusted predictive accuracy. Other differences include unexecuted liquidations and collateral outside the single-asset model.

Pool depth was measured in **2026**, not at the 2025 event, and is explicitly an assumption. The replay is an off-chain historical analysis, not a testnet proof transaction. Sources: [`scripts/src/replay`](scripts/src/replay), [recorded comparison](scripts/data/oct10-replay.json), and [archived book](scripts/data/oct10-weth.json).

## Integrations and award evidence

| Track / integration | Where Kaskad uses it | Evidence and status |
|---|---|---|
| **Track 1: Onchain Finance & Trading** | An on-chain cascade engine and a risk feed consumed by a circuit breaker and an ERC-4626 demo vault. | [Contracts](contracts/src), [Guard demo](https://kaskad42.vercel.app/guard), and proof transactions below. |
| **Envio** | HyperSync discovers Aave borrowers from event history before RPC/Multicall reads their positions at a pinned block. | [`hypersync.ts`](scripts/src/lib/hypersync.ts), [`fetch-positions.ts`](scripts/src/fetch-positions.ts). HyperSync is implemented; a continuous HyperIndex/keeper pipeline is pending. |
| **Chainlink CRE** | Cron/book-event workflow decides when to publish risk, refresh the guard, and rebalance the vault. | [`workflow.ts`](cre/kaskad-risk/workflow.ts), [`decide.ts`](cre/kaskad-risk/decide.ts), [receiver](contracts/src/KaskadCREReceiver.sol), [broadcast logs](cre/runs). Proven through broadcast simulations, as scoped above. |
| **Alchemy** | Server-configured Monad RPC endpoints support Aave position reads, the testnet RPC proxy, and sponsored proof transactions. | [`chain.ts`](scripts/src/lib/chain.ts), [`/api/position`](web/app/api/position/route.ts), [`/api/rpc`](web/app/api/rpc/route.ts), [`/api/fund`](web/app/api/fund/route.ts). Provider credentials remain server-side. |
| **Perpl: Best Analytics / Risk Tool** | Reads open positions and margin/insurance parameters from Perpl contracts, plus the public L2 order book; models liquidation absorption, backstop demand, and residual deficits. | [Panel](https://kaskad42.vercel.app/perps), [reader](web/lib/kaskad/perpl.ts), [model](web/lib/chain/perpl-model.ts), [#12](https://github.com/mryavascann/kaskad/pull/12). Read-only analytics; no hedge bot. |
| **Mera: Best Mera-Powered UX on Monad** | Passkeys are the production account layer; the sponsor funds gas and the user signs in the browser. | [`mera.ts`](web/lib/kaskad/mera.ts), [`signer-mode.ts`](web/lib/chain/signer-mode.ts), [passkey gate](web/views/shared/tx/passkey-gate.tsx), [#4](https://github.com/mryavascann/kaskad/pull/4). |
| **Mera: One Passkey, Many Keys** | One PRF output also derives an AES-256-GCM encryption key, an anonymous watchlist ID, and a write token using distinct HKDF labels. | [`passkey-keys.ts`](web/lib/kaskad/passkey-keys.ts), [watchlist API](web/app/api/watchlist/route.ts), [#5](https://github.com/mryavascann/kaskad/pull/5). Production persistence requires Upstash/Vercel KV. |
| **Nansen** | Planned “Who is exposed” borrower-label analysis. | Work in progress, awaiting a valid API key and integration into `main`; no shipped Nansen feature or completed award claim yet. |

The same project evidence supports **Grand Champion** consideration. **Community Team** eligibility is awaiting organizer confirmation. The separate **Best use of Perpl's API** hedge-bot bounty is outside this submission's scope.

The Perpl panel refreshes every 10 seconds, with an 8-second server cache per market. Its **5% order-book execution band is a model assumption**; current-book absorption and insurance calculations are stress scenarios, not a guarantee of future fills or backstop capacity.

### Perpl wallet risk

Below the protocol panel, **Wallet risk on Perpl** accepts a public wallet address without connecting or signing. It shows the Perpl account's available and order-locked balances, position equity, gross notional, liquidation prices, adverse distances to liquidation, and threshold exposure under ±5%, ±10%, and ±20% price moves. The section supports English and Turkish.

[`/api/perpl/wallet`](web/app/api/perpl/wallet/route.ts) reads the account, active positions, marks, and maintenance parameters at **one Monad mainnet block**. It uses the existing server-only `MONAD_MAINNET_RPC`. The [reader](web/lib/kaskad/perpl-wallet.ts) follows the account bitmap and ABI in the [official Perpl SDK](https://github.com/PerplFoundation/dex-sdk/tree/01b9910761755b0a0d9c710c1ede62ab937daa7d/crates/sdk). Coverage is BTC, ETH, SOL, MON, HYPE, and ZEC; active markets outside that set produce an explicit partial-coverage warning. Missing accounts, accounts without supported open positions, and failed reads have separate states. Failed refreshes retain the last successful result with a warning and its block/time.

The [wallet model](web/lib/chain/perpl-wallet-risk.ts) uses each position's isolated collateral and current funding. Free account balance is not added to position margin. Shock totals represent the **current notional of positions crossing their liquidation thresholds**, not estimated losses or executable liquidation proceeds. The same signed move applies to all supported markets; future funding, fees, borrower actions, and execution are excluded.

Submitted addresses reach Kaskad's server and RPC provider; they are not saved in browser storage. The view refreshes every 10 seconds while visible. Its separate bounded server cache lasts 8 seconds, and its 30-requests/minute limit is **per server instance**, not a shared production limiter.

The watchlist encrypts addresses and labels in the browser. Its storage endpoint keeps ciphertext, an opaque ID, and a write-token hash; it does not receive the plaintext list. Explicit address-risk checks still send the address being queried to `/api/position`.

## Deployments and proof transactions

All addresses and transactions in this section are on **Monad testnet**. Deployment manifests: [original engine](contracts/deployments/testnet.json), [risk pipeline](contracts/deployments/risk-testnet.json), and [CRE receiver](contracts/deployments/cre-testnet.json).

| Contract | Address |
|---|---|
| Kaskad — book and cascade engine | [`0xdC2D3A2F4cffBf6a0d7945f6505399e2e474b661`](https://testnet.monadscan.com/address/0xdC2D3A2F4cffBf6a0d7945f6505399e2e474b661) |
| KaskadMC — recovery and Monte Carlo | [`0x94f27456bBAfe2a8A69ADE8D4C98eB958abB1E6d`](https://testnet.monadscan.com/address/0x94f27456bBAfe2a8A69ADE8D4C98eB958abB1E6d) |
| Guard — original demo | [`0xc39996831d3759CD4E9fB25005B400CA6a22871e`](https://testnet.monadscan.com/address/0xc39996831d3759CD4E9fB25005B400CA6a22871e) |
| KaskadMCv3 — on-chain hidden bad debt | [`0x389dD6251Fdc2f8D108fdbeC415d0AB517Ad3690`](https://testnet.monadscan.com/address/0x389dD6251Fdc2f8D108fdbeC415d0AB517Ad3690) |
| RiskOracle | [`0x0275C5b49f48D4ec9aE85D50785D160aaA1161e5`](https://testnet.monadscan.com/address/0x0275C5b49f48D4ec9aE85D50785D160aaA1161e5) |
| GuardV2 | [`0x874d38464c5845950c8693C35034E53279C2DAfc`](https://testnet.monadscan.com/address/0x874d38464c5845950c8693C35034E53279C2DAfc) |
| RiskVault — ERC-4626 demo | [`0x2aEa83Fc7F9834af61F7BbbBaF03707A6472a8C4`](https://testnet.monadscan.com/address/0x2aEa83Fc7F9834af61F7BbbBaF03707A6472a8C4) |
| MockUSD — demo kUSD | [`0x211Ed739699eAdfeA64AB08f7284F3aAE4467714`](https://testnet.monadscan.com/address/0x211Ed739699eAdfeA64AB08f7284F3aAE4467714) |
| Demo syrupUSDC market | [`0x80E3c0a78E86686CA6309A3CAdA587c2DCf45074`](https://testnet.monadscan.com/address/0x80E3c0a78E86686CA6309A3CAdA587c2DCf45074) |
| Demo WETH market | [`0x03AC872EF1A2a77ECa869A0F8aC7c9b9F9727842`](https://testnet.monadscan.com/address/0x03AC872EF1A2a77ECa869A0F8aC7c9b9F9727842) |
| KaskadCREReceiver | [`0xfdef473e3C03F42A2bC9ad5eC1e4f3b02f9c2e86`](https://testnet.monadscan.com/address/0xfdef473e3C03F42A2bC9ad5eC1e4f3b02f9c2e86) |
| MockKeystoneForwarder — CRE simulation | [`0xB9F79d863261869B234c481D1f9A7af84AeAd192`](https://testnet.monadscan.com/address/0xB9F79d863261869B234c481D1f9A7af84AeAd192) |

| Recorded action | Result at execution | Transaction |
|---|---|---|
| syrupUSDC −3%, external oracle | $0 bad debt; $111.0M stuck debt | [0xc80d…3a99](https://testnet.monadscan.com/tx/0xc80dfd34835edcba1028b76945f4793598cf3b27bee470e79cffdd75b8a53a99) |
| syrupUSDC −3%, pool-following oracle | $115.9M bad debt | [0xb0a5…288b](https://testnet.monadscan.com/tx/0xb0a5d7d76f17c728f6b33f0a58cd049ab3d5a6149e9288a83086d4a60a8a288b) |
| 10,000-position cascade | 17.7M engine gas, ~1.6 MB memory | [0x661f…185c](https://testnet.monadscan.com/tx/0x661facb56395f553be94399d004f0ca75834cc2f5037f54d37adff832d6d185c) |
| Monte Carlo: 208 × 57 positions, external oracle | Mean / p95 / worst bad debt: $0 | [0x1dba…42ce](https://testnet.monadscan.com/tx/0x1dbadcecf6248281f71c63b41552092f03d1eb2a75dd793e4cd1985f272c42ce) |
| Monte Carlo: 56 paths, pool-following oracle | Mean $84.3M; p95 $119.4M; loss in 46/56 paths | [0x124f…635f](https://testnet.monadscan.com/tx/0x124fedb1e345dbc68ac800c9bf6bccd108d2a16c9188d8c618cb3d87ada7635f) |
| Original Guard refresh | Market B paused; max LTV 90% → 70% | [0xf779…3aa3](https://testnet.monadscan.com/tx/0xf779c8a68fcee03c9f4c7d10c297006efdbe85b24450826c496d5eb022693aa3) |
| RiskOracle publishes syrupUSDC | Flags risk; recommended LTV 90% → 85% | [0x5959…a8f9](https://testnet.monadscan.com/tx/0x59594b314e45d202a2182dacc29d813ce9649d07a146e3e30687dd9cdba3a8f9) |
| GuardV2 refresh | Pauses the flagged syrupUSDC demo market | [0xf118…ee14](https://testnet.monadscan.com/tx/0xf118735735ee6ed382776334e6c67cba57f60feb00fb4c569778e54b5505ee14) |
| RiskVault rebalance | Allocates the deposited 1M demo kUSD to the WETH market | [0x3761…84ab](https://testnet.monadscan.com/tx/0x376163f88fb8fb1aa9e455976a672045b1448f2f6bce5465b1c0d05627c984ab) |
| CRE cron broadcast simulation | Refreshes stale reports; syrupUSDC recommended LTV 85% → 80% | [0x0716…c5b5](https://testnet.monadscan.com/tx/0x07161a3ab2b540af3e1177e40161027893e800a9551df37bb019f8e38f89c5b5) |
| CRE book-event broadcast simulation | Publishes after cooldown; recommended LTV 80% → 75% | [0xd724…55db](https://testnet.monadscan.com/tx/0xd7249a005920b4769d98789991c62857f90601dfa474a1c4d7692608716055db) |

The new risk-system transactions are recorded in the [DemoRisk broadcast artifact](contracts/broadcast/DemoRisk.s.sol/10143/run-latest.json). The [CRE logs](cre/runs) also include a cooldown run and a steady-state run that sent no report. Stored reports and current market state can change after these transactions.

## Assumptions and limits

- **Snapshot data:** the published Aave books are recorded snapshots loaded into testnet. A continuously updating indexer/keeper is not yet implemented. The Perpl panel separately reads live mainnet data.
- **One dominant collateral per position:** other collateral is held constant, and debt is modeled in USD. Some correlated borrowing loops and dust are excluded from the Ethereum datasets; each dataset records its scope.
- **Liquidity approximation:** depth is a TVL-based proxy or an explicitly labeled assumption, represented by a virtual constant-product pool. It is not a measured executable slippage curve across all venues.
- **Liquidator behavior:** the engine models immediate DEX sales up to break-even. It does not model capitalized liquidators holding collateral for redemption, cross-chain exits, or borrowers defending themselves.
- **Arbitrage and time:** recovery rates are asset-specific assumptions; the default console run covers 20 simulated blocks. Long depegs and borrower reactions require a different model.
- **Monte Carlo:** paths are generated from a deterministic seed and the configured shock distribution. Scenario frequencies are not calibrated probabilities of real market losses.
- **Historical replay:** the borrower book is historical, but liquidity depth is from the later measurement date. The analysis makes these sources and exclusions explicit.
- **Maturity:** the recorded PT-AUSD book refers to a token maturing on 8 October 2026; results from that snapshot must not be treated as a refreshed post-maturity market.
- **Demo controls:** Guard and RiskVault operate on mock markets and demo kUSD. The prototype has tests, but they are not an independent security audit or validation for custody of real funds.

## Run locally

Use **Node.js 24** for the web app and data scripts, **Foundry** for contracts, and **Bun** for CRE tests. The web app uses Next.js 16.3.6; contributors should follow [`web/AGENTS.md`](web/AGENTS.md) and the installed Next.js documentation.

```bash
git clone --recurse-submodules https://github.com/mryavascann/kaskad.git
cd kaskad
npm --prefix web ci
```

Create **`web/.env.local` yourself**, using your own server-side values:

| Variable | Purpose |
|---|---|
| `MONAD_TESTNET_RPC` | Testnet RPC URL for `/api/rpc` and gas sponsorship; the project's provider setup uses Alchemy. |
| `MONAD_MAINNET_RPC` | Mainnet RPC URL for Aave address lookups and Perpl reads. |
| `SPONSOR_PRIVATE_KEY` | Funded testnet sponsor key, needed for gas top-ups when signing. It is separate from the user's passkey key. |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | Persistent encrypted watchlists through Vercel KV/Upstash. Alternatively use `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`. |

```bash
npm --prefix web run dev
```

Open [localhost:3000](http://localhost:3000). Restart the development server after changing environment variables. Without KV, development watchlists use process memory; production returns **503 / unconfigured**. Do not set `NEXT_PUBLIC_DEV_SIGNERS` in production: `NEXT_PUBLIC_DEV_SIGNERS=1` exposes additional development signers. Do not place private keys or authenticated RPC URLs in `NEXT_PUBLIC_*` variables.

Some server-rendered previews use the public testnet RPC by default; browser reads use `/api/rpc`. The deployed contracts already contain books, so starting the web app does not require fetching or loading positions again.

### Data scripts and historical replay

Scripts read **repo-root `.env`**, not `web/.env.local`. For Monad borrower discovery, configure `MONAD_MAINNET_RPC` and `ENVIO_API_TOKEN` there.

```bash
npm --prefix scripts ci
npm --prefix scripts run fetch
npm --prefix scripts run depth
```

These commands read external data and update local dataset files. Ethereum fetching can fall back to public RPC logs without an Envio token. To rebuild the historical comparison, run in order:

```bash
npm --prefix scripts run replay:events
npm --prefix scripts run replay:book
npm --prefix scripts run replay:trough
npm --prefix scripts run replay:compare
```

Loading books, deploying contracts, running the transaction measurement script, or broadcasting CRE reports **writes to Monad testnet and spends MON**. Those actions are separate from read-only setup and tests: review the destination, estimated cost, and signer before running them. The loader requires `MONAD_TESTNET_RPC` and `DEPLOYER_PRIVATE_KEY` in repo-root `.env`; CRE broadcasting uses `CRE_ETH_PRIVATE_KEY` in `cre/.env`. See [the CRE setup guide](cre/README.md) for simulation instructions.

### Validation

From the repository root:

```bash
(cd web && npx tsc --noEmit)
(cd web && npx eslint .)
(cd web && npx vitest run)
(cd contracts && forge fmt --check)
(cd contracts && forge test --no-match-contract 'GasBench|Profile')
(cd scripts && npx tsc --noEmit)
(cd cre/kaskad-risk && bun install --frozen-lockfile)
(cd cre/kaskad-risk && bun test)
(cd cre/kaskad-risk && bunx tsc --noEmit)
(cd cre/kaskad-risk && bun x cre-compile main.ts dist/workflow.wasm)
```

[CI](.github/workflows/ci.yml) runs web tests/typecheck/lint, contract formatting and functional tests, script typechecking, and CRE tests/typecheck/WASM compilation. CI excludes the diagnostic `GasBench` and `Profile` contract suites. Tests cover cascade invariants, replay consistency, hidden bad debt, risk controls, the CRE receiver and workflow, passkey/watchlist behavior, and the Perpl model and UI.

Plain `forge test` also includes the diagnostic suites. Their large synthetic-book setup exceeds the configured 30M local gas budget. To run all suites, including those diagnostics, use:

```bash
(cd contracts && forge test --gas-limit 1000000000)
```

This higher limit is only for the local test harness; it does not demonstrate that a workload fits into a Monad transaction. Use the recorded testnet proofs for that claim.

## Remaining work

As of **7 October 2026**:

- Complete and verify the Nansen integration after a valid API key is configured.
- Add the continuous Envio HyperIndex/keeper pipeline and source-block freshness indicator.
- Move API rate limits from process memory to shared storage; tighten RPC target/batch restrictions and sponsor grant limits. Existing method allowlisting is not a contract-address allowlist.
- Verify production Upstash/Vercel configuration for persistent watchlists and maintain the demo's testnet gas budget.
- Add the final demo video, at most three minutes, and complete the submission materials.

## Repository map

| Directory | Contents |
|---|---|
| [`contracts/`](contracts) | Solidity engines, risk feed, guards, demo vault, tests, deployments, and broadcast records. |
| [`scripts/`](scripts) | Data acquisition, calibration, loaders, measurement tools, and historical replay datasets. |
| [`web/`](web) | Next.js app, chain readers, simulation mirror, passkey integration, and API routes. |
| [`cre/`](cre) | Chainlink CRE workflow, tests, configuration, and recorded simulations. |

Licensed under the [MIT License](LICENSE).
