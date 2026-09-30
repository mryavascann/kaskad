# Kaskad web: chain / data layer inventory

Snapshot of branch `feat/metropolis-frontend` (Next 16.3.6, React 19.2.8, viem 2.56). Purpose: the UI is being rebuilt; the new UI
must only call the layer listed here. Nothing in this file changes behavior. "Recommended home" entries are suggestions only.

Conventions: `file:line` paths are relative to `web/`. `[v]` = view / eth_call (free), `[tx]` = state-changing transaction (costs MON).
USD values from the engine are WAD (1e18) bigints; convert with `wadToNum`.

---

## 1. Contracts & addresses

Source of truth for the UI: `lib/kaskad/deployment.json` (written by `scripts/src/load-testnet.ts`, read through `lib/kaskad/config.ts`).
`contracts/deployments/testnet.json` holds the same addresses in a flat shape plus `kaskadMCv1` (legacy, not used by the web app).

Monad testnet, chainId `10143`, deploy block `65813636`. Data source: Monad mainnet (chainId `143`) Aave, block `108133182`.

| Name | Address | Role | UI calls (view) | UI calls (tx) | Events the UI reads |
|---|---|---|---|---|---|
| `kaskad` (Kaskad) | `0xdC2D3A2F4cffBf6a0d7945f6505399e2e474b661` | Cascade engine + position books. Used for **calibrated** books (assetId >= 256). | `preview(Scenario)`, `previewCurve(Scenario,uint16[])` via `engineFor()` | `simulate(Scenario)` via `engineFor()` | `SimulationDone` (decoded from receipt in `Protocol.tsx:255-263`, only to check presence) |
| `kaskadMC` (KaskadMC) | `0x94f27456bBAfe2a8A69ADE8D4C98eB958abB1E6d` | v2 engine: same cascade + inter-block arbitrage recovery (`recoveryBps`) + Monte Carlo. Used for **real** books (assetId < 256). Optional in the `DEPLOYMENT` type. | `preview`, `previewCurve` (encoded with `kaskadAbi`; same selectors), `previewMC(Scenario,paths,seed)` | `simulate(Scenario)`, `simulateMC(Scenario,paths,seed)` | none decoded (tx hash + status only) |
| `guard` (KaskadGuard) | `0xc39996831d3759CD4E9fB25005B400CA6a22871e` | On-chain circuit breaker: runs its stored scenario on the engine, pauses borrowing on market B if bad debt > threshold. | `scenario()` | `refresh()` (anyone may call) | none decoded (UI re-reads market state) |
| `marketA` (MockMarket) | `0xedDE26053c7Df1D9970C1aE201FEc6e3681275Bd` | Unprotected demo lending market. | `borrowPaused()`, `maxLtvBps()`, `totalBorrowed()` | `borrow(1000e18)` | none (revert string `BorrowIsPaused` matched on error text) |
| `marketB` (MockMarket) | `0x0B545DfD67223Bb00A22701C38e53774dF0A51ed` | Guard-protected demo market. | same as A | `borrow(1000e18)` | none |
| Aave V3 Pool (Monad **mainnet**) | `0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef` | Read-only, server side via `/api/position`. | `getReservesList`, `getUserAccountData`, `getUserEMode`, `getUserConfiguration`, `getEModeCategoryCollateralConfig`, `getEModeCategoryCollateralBitmap` | - | - |
| Aave DataProvider (mainnet) | `0xB65A68B98274ef7D9a60E0C0747dD1BEc3D32fad` | idem | `getReserveTokensAddresses`, `getReserveConfigurationData` | - | - |
| Aave Oracle (mainnet) | `0x0c02b2c2038066C10Eab8fe1D5Cdb73d5a78A1Bf` | idem | `getAssetsPrices` | - | - |

`Scenario` tuple (all engines + guard): `{ assetId uint16, shockBps uint16, steps uint16, maxRoundsPerStep uint16, maxPositions uint32, oracleFeedbackBps uint16 }`.
`assetId | 256` (`CALIBRATED`) selects the calibrated book of that asset.

### Generated ABIs (`lib/kaskad/abi.ts`, written by `scripts/src/export-abi.ts`; do not edit)

| Export | Functions (`[v]` view, `[tx]` write) | Events |
|---|---|---|
| `kaskadAbi` | `preview`[v] `previewCurve`[v] `simulate`[tx] `assets`[v] `bookLength`[v] `bookStats`[v] `positionAt`[v] `rawSlot`[v] `lastResult`[v] `nonces`[v] `sourceBlock`[v] `CALIBRATED`/`MAX_ASSETS`/`MAX_CURVE_POINTS`/`MAX_ROUNDS`/`MAX_STEPS`[v]; owner-only: `loadPositions` `resetBook` `setAsset` `setDataInfo` + Ownable2Step | `Round`, `SimulationDone`, `AssetSet`, `BookReset`, `DataInfoSet`, `PositionsLoaded`, ownership |
| `kaskadMCAbi` | all of `kaskadAbi` + `previewMC`[v] `simulateMC`[tx] `recoveryBps`[v] `source`[v] `MAX_PATHS`[v]; owner-only `setRecovery` | + `MonteCarloDone`, `RecoverySet` |
| `guardAbi` | `scenario`[v] `badDebtThresholdBps`[v] `liquidationThresholdBps`[v] `safeLtvBps`[v] `engine`[v] `market`[v] `refresh`[tx, returns `bool tripped`]; owner-only `setConfig` + Ownable2Step | `ConfigSet`, `GuardChecked`, `GuardTripped`, ownership |
| `mockMarketAbi` | `borrow`[tx] `borrowPaused`[v] `maxLtvBps`[v] `totalBorrowed`[v] `guard`[v] `name`[v]; owner/guard: `setBorrowPaused` `setMaxLtv` `setGuard` | `Borrowed`, `BorrowPausedSet`, `MaxLtvSet`, `GuardSet`, ownership |

Key return shapes:
- `preview` / `simulate` result (`Result` in `useKaskad.ts:28-43`): `totalDebt, totalCollateral, totalLiquidated, totalSeized, badDebt, stuckDebt, startPrice, finalPrice` (WAD), `rounds, liquidations, positionsUsed` (uint32), `gasUsed, memoryBytes`, `log: {step, round, liquidations, priceWad, liquidatedDebt, seized, deficit}[]`.
- `previewCurve` -> `[badDebt[], liquidated[], gasUsed, memoryBytes]`.
- `previewMC` -> `{paths, positionsUsed, totalDebt, meanBadDebt, p95BadDebt, worstBadDebt, lossPaths, meanShockBps, worstShockBps, gasUsed, memoryBytes, badDebt[], shockBps[]}`.
- Read-only views not used by the UI today but available for "no hardcoded numbers": `guard.badDebtThresholdBps()`, `guard.safeLtvBps()`, `guard.liquidationThresholdBps()`, `kaskadMC.recoveryBps(id)`, `assets(id)` (price + depth WAD), `bookStats(id)`, `sourceBlock()`, `lastResult(addr)`.

---

## 2. Chain layer modules (`lib/kaskad/*`)

These files are also imported by `scripts/src/*` with `../../web/lib/kaskad/<name>.js` paths, and `load-testnet.ts` writes
`lib/kaskad/deployment.json`. **Do not move or rename `lib/kaskad/`.**

### config.ts
| Export | Signature / value | Notes |
|---|---|---|
| `AssetInfo` | type: `id, symbol, decimals, priceUsd, suppliedUsd, depthUsd, depthIsAssumption, depthSource, depthNote, realPositions, calibratedPositions, collateralUsd, debtUsd, ltBps, bonusBps, inUi` | One book per asset id. |
| `DEPLOYMENT` | `{ chainId, contracts: {kaskad, kaskadMC?, guard, marketA, marketB}, deployBlock, source: {chainId, block, borrowersWithDebt}, totals: {suppliedUsd, debtUsd, borrowerCollateralUsd, positions}, assets: Record<string, AssetInfo> }` | Static JSON import; no network. Asset ids present: 0,1,2,5,6,7,8,9,10,11,12,13,14,15. |
| `CALIBRATED` | `256` | OR'ed into assetId to pick the calibrated book. |
| `UI_ASSET_ORDER` | `[9, 12, 2, 5, 8, 15, 14, 13, 7]` | 7, 13, 14, 15 are books read from Aave on **Ethereum**, simulated on Monad. |
| `UI_ASSETS` | `AssetInfo[]` from the order above | Used by the "other tokens" select. |
| `TESTNET_RPC` | `NEXT_PUBLIC_MONAD_TESTNET_RPC ?? (browser ? \`${origin}/api/rpc\` : "https://testnet-rpc.monad.xyz")` | Evaluated at module load. Browser -> own proxy (keeps provider key server-side). SSR -> public RPC. |
| `EXPLORER`, `txUrl(h)`, `addrUrl(a)` | `https://testnet.monadscan.com` | Pure. |
| `RESOLUTIONS` | `[500, 1000, 2000, 5000, 10000]` | Calibrated-book resolution steps (filtered by `calibratedPositions`). |

### burner.ts (`"use client"`)
| Export | Signature | What / side effects | Callers |
|---|---|---|---|
| `publicClient` | `PublicClient` (monadTestnet, `http(TESTNET_RPC, {batch:true})`) | Shared read client. All eth_calls, balances, receipts. Created at import. | useKaskad, MonteCarlo, GuardPanel, Connect, signer |
| `getBurner()` | `(): PrivateKeyAccount` | Reads/creates a private key in `localStorage["kaskad.burner.v1"]` (testnet throwaway). Memoized. | signer, Connect |
| `Status` | `(s: string) => void` | Status callback type. | |
| `ensureFunded(needWei, onStatus)` | `Promise<void>` | `getBalance`; if short, `POST /api/fund {address, needWei}`, then polls balance every 400 ms up to 20 s, plus 1 s settle. Throws on error/timeout. Spends **sponsor** MON. | `signer.sendTx` |
| `sendBurnerTx(to, data, gas)` | `Promise<SendResult>` | Serial queue, local nonce (`getTransactionCount pending` once), fixed EIP-1559 fees, signs locally, `sendRawSync`. On non-nonce error re-signs with tip +1 wei once; on nonce error resets nonce and throws. Spends burner MON (= gas limit x price). | `signer.sendTx` |

### signer.ts (`"use client"`)
Module-level singleton; state is **not persisted** (reload -> burner; Mera key only in memory).

| Export | Signature | What / side effects | Callers |
|---|---|---|---|
| `SignerKind` | `"burner" \| "injected" \| "mera"` | | |
| `signerStore` | `{ subscribe(l), get(): {kind, address}, server(): {kind:"burner", address:null} }` | External store for `useSyncExternalStore`. `get()` lazily calls `getBurner()` (may write localStorage). | `components/ui/use-signer.ts`, CostTag `confirmCost`, GuardPanel `borrow` |
| `selectBurner()` | `void` | Switch to burner. | Connect |
| `connectInjected()` | `Promise<Address>` | `eth_requestAccounts`, switches/adds Monad testnet (`wallet_switchEthereumChain` / `wallet_addEthereumChain`), sets signer. Wallet popups. | Connect |
| `connectMeraSigner(mode: "login"\|"create")` | `Promise<Address>` | Dynamic-imports `mera.ts`, WebAuthn passkey prompt, sets signer. | Connect |
| `Sent` | `{ receipt, ms, sync }` | | |
| `sendTx(to, data, gas, onStatus)` | `Promise<Sent>` | **The only tx entry point for the UI.** burner: `ensureFunded(gas*MAX_FEE)` + `sendBurnerTx`. mera: balance check (`gas*MAX_FEE`), own serial queue + nonce, local sign, `sendRawSync`. injected: ensures chain, balance check, `wallet.sendTransaction` (wallet signs + broadcasts), `waitForTransactionReceipt` (300 ms poll, 60 s). Status strings (Turkish) are pushed through `onStatus`. | Protocol `simulate`, MonteCarlo `prove`, GuardPanel `runGuard`/`borrow` |
| `signerLabel` | `Record<SignerKind,string>`: "Geçici cüzdan (sponsorlu)", "Tarayıcı cüzdanı", "Mera passkey" | | SignerBadge, Protocol, Connect |

### tx.ts
| Export | Value / signature | Notes |
|---|---|---|
| `MAX_FEE_PER_GAS` | `150 gwei` | Monad min base fee is 100 gwei. |
| `MAX_PRIORITY_FEE_PER_GAS` | `2 gwei` | Fixed on Monad. |
| `SendResult` | `{ receipt, sync, ms }` | |
| `sendRawSync(client, raw, timeoutMs=15000)` | `Promise<SendResult>` | Tries `eth_sendRawTransactionSync` (receipt in one round trip); caches "unsupported" per module; falls back to `eth_sendRawTransaction` + `waitForTransactionReceipt` (250 ms poll). Tolerates "already known"/"nonce too low" on fallback. Used by burner, signer, `/api/fund`, scripts. |

### mera.ts (`"use client"`)
| Export | Signature | Side effects |
|---|---|---|
| `connectMera(mode="login")` | `Promise<LocalAccount>` | WebAuthn PRF passkey (rpId = `location.hostname`); `create` stores `{credentialId, transports}` in `localStorage["kaskad.mera.credential"]` (no secret). Derives BIP-44 `m/44'/60'/0'/0/0` key from PRF, wraps in a signing session, zeroes the key buffer. |
| `hasStoredMeraPasskey()` | `boolean` | Reads localStorage. |
Callers: `signer.connectMeraSigner`, `cuzdan/Wallet.tsx` `mera()` (address-only lookup; does **not** change the active signer).

### aave.ts (isomorphic, used server-side by `/api/position`)
| Export | Signature | What |
|---|---|---|
| `AAVE` | `{POOL, DATA_PROVIDER, ORACLE}` | Monad mainnet addresses (table above). |
| `ReserveLine` | `{id, symbol, suppliedUsd, borrowedUsd, isCollateral, ltBps, bonusBps, utilization, reserveSuppliedUsd}` | |
| `UserPosition` | `{address, block, eMode, hfOnchain: number\|null, collateralUsd, debtUsd, reserves: ReserveLine[], dominant: ReserveLine\|null, otherLtAdjustedUsd, protocol: {suppliedUsd, debtUsd}}` | All plain numbers (JSON-safe). `hfOnchain` null when HF is "infinite". |
| `fetchUserPosition(client, user)` | `Promise<UserPosition>` | Static reserve data cached 30 min (module memory): `getReservesList` + multicall of token addresses/config/symbols + e-mode configs 1..8. Per call: `getBlockNumber` + one multicall at that block (account data, e-mode, user config, oracle prices, aToken/vToken balances and totalSupply per reserve). Applies e-mode LT/bonus, picks dominant collateral, expresses other collateral in dominant-LT units. Requires Multicall3 (mainnet). |

### math.ts (pure)
| Export | Signature / value | What |
|---|---|---|
| `MONAD_TX_GAS_LIMIT` | `30_000_000` | Per-tx gas limit; also the eth_call gas cap convention. |
| `MONAD_MEMORY_LIMIT` | `8 MiB` | Per-tx memory. |
| `ETH_TX_GAS_CAP` | `16_777_216` (2^24, EIP-7825) | |
| `ETH_COLD_SLOAD` | `2_100` | |
| `MONAD_PAGE_SLOTS` | `128` | MIP-8 page size. |
| `ethMemoryGas(bytes)` | `3w + floor(w²/512)` | |
| `monadMemoryGas(bytes)` | `floor(w/2)` | |
| `healthFactor(coll, other, ltBps, debt)` | number | Single-LT HF; `Infinity` if no debt. |
| `depegToLiquidation(coll, other, ltBps, debt)` | fraction | Drop of dominant collateral at which HF = 1. <=0 already liquidatable; >=1 never. |
| `collateralToSurvive(coll, other, ltBps, debt, shock, target=1.05)` | USD | Extra collateral (today's price) to keep HF >= target after `shock`. |
| `repayToSurvive(..., shock, target=1.05)` | USD | Debt to repay for the same goal. |
| `simulateGasLimit(previewGas, rounds)` | bigint | `min(previewGas*1.15 + rounds*4000 + 250000, 30M)`. |
| `monteCarloGasLimit(previewGas)` | bigint | `min(previewGas*1.15 + 250000, 30M)`. |
| `CHARGED_GWEI` | `102n` | 100 gwei base + 2 gwei tip, what testnet actually charges. |
| `monCost(gasLimit)` | number (MON) | `gasLimit * 102 gwei`. Monad charges the limit, so cost is known before sending. |

### format.ts (pure, Turkish locale)
`fmtUsd(n)` ($1,2 Mr / $115,9M / $3,4K / $12), `fmtNum(n, digits=0)`, `fmtPct(x, digits=1)` (prefix `%`), `wadToNum(w)` (WAD -> number, 6-decimal precision),
`fmtBytes(b)`, `fmtGas(g)` (1,23M / 45k), `shortAddr(a)` (`0x1234…abcd`).

### recovery.ts
`RECOVERY_BPS: Record<assetId, {bps, why}>`: assumed share of pool displacement arbitrage closes per block (mirrors what
`scripts/src/set-recovery.ts` wrote on KaskadMC). Values: 5→5000, 7→9000, 13→9000, 14→5000, 2→1000, 10→1000, 8→2000, 9→0, 15→0, 12→0.
`why` strings are UI honesty copy (assumption labels). Could be cross-checked on chain with `kaskadMC.recoveryBps(id)`.

### timeline.ts (pure)
`BlockPoint {step, price, liquidated, liquidations, waves}`; `blockTimeline(r, s) -> {points, activeBlocks, lastActiveStep}`.
Expands the engine log (only waves that liquidated) to one point per block 0..steps: exact external-path price when feedback = 0,
first-wave oracle price otherwise, carried-forward displacement for empty blocks; last point forced to `finalPrice`.
Callers: `Charts.CascadeChart`, `components/visual/DominoCascade`.

### calibrate.ts / pack.ts (pure; scripts + tests only, not used by UI)
- `pack.ts`: `PackedPosition` type, `packPosition`, `unpackPosition`, `toUnits6`, `usdTo6` (mirror of `PositionBook.sol` bit layout).
- `calibrate.ts`: `RealPosition` type, `realToPacked`, `rng(seed)` (mulberry32), `calibrateBook(real, n, priceUsd, seed=42)` (debt-weighted resample, log-normal sizes, total debt preserved; any prefix is iid, which the resolution knob relies on), `packAll`.
- Used by `scripts/src/load-testnet.ts` and `lib/kaskad/kaskad.test.ts`.

### Other lib
- `lib/utils.ts`: `cn(...classes)` (clsx + tailwind-merge).
- `lib/kaskad/kaskad.test.ts`: vitest coverage for pack, memory gas, risk math, gas-limit helpers, `monCost`, calibration, `blockTimeline`.

---

## 3. Data hooks & orchestration living in UI files (extract unchanged)

| Item | Location | Inputs → outputs | Network / side effects | Recommended home |
|---|---|---|---|---|
| `Scenario`, `RoundLog`, `Result` types | `app/_components/useKaskad.ts:9-43` | - | - | `lib/chain/types.ts` |
| `engineFor(assetId)` | `useKaskad.ts:50-52` | assetId → address: `kaskad` if `assetId >= 256` or no kaskadMC, else `kaskadMC` | none | `lib/chain/engine.ts` |
| `call30M(fn, args, assetId)` (private) | `useKaskad.ts:55-60` | encodes with `kaskadAbi`, `publicClient.call({gas: 30M})`, decodes | 1 eth_call | `lib/chain/engine.ts` |
| `previewScenario(s)` | `useKaskad.ts:62-64` | Scenario → `Result` | 1 eth_call (free) | `lib/chain/engine.ts` |
| `previewCurve(s, shocks)` | `useKaskad.ts:66-74` | Scenario, bps[] → `{bad[], liq[]}` | 1 eth_call | `lib/chain/engine.ts` |
| `usePreview(s)` | `useKaskad.ts:77-107` | Scenario → `{result, error, loading, ms}` | Debounced 600 ms, sequence guard against stale responses; `loading` derived from `state.key !== key` (no setState in effect body). Error mapping: `/gas\|out of/` → "30M gas sınırı aşıldı: bu çözünürlük tek tx'e sığmıyor.", else "Önizleme başarısız." | `lib/chain/hooks/usePreview.ts` |
| Scenario builder | `Protocol.tsx:201-217` | Settings `{assetId, shockPct, steps, rounds, feedback, calibrated, resolution}` → Scenario. `assetId = useCal ? 256\|id : id`; `shockBps = round(shockPct*100)`; `maxPositions = useCal ? min(resolution, calibratedPositions) : realPositions`; `useCal = calibrated && calibratedPositions > 0` | none | `lib/chain/scenario.ts` (`buildScenario(settings)`) |
| Calibrated scale | `Protocol.tsx:244` | `scale = useCal ? asset.debtUsd / wadToNum(r.totalDebt) : 1`; all USD amounts on a partial calibrated book are multiplied by it | none | `lib/chain/scenario.ts` |
| Stress curve loader | `Protocol.tsx:221-241` | real book, `shockBps 0`, CURVE_SHOCKS `[10,50,100,300,500,1000,2000,3000]`, both `oracleFeedbackBps 10000` (market) and `0` (rate) → `{market[], rate[]}` | 2 eth_calls when asset/steps/rounds change | `lib/chain/hooks/useStressCurve.ts` |
| `simulate()` (prove on chain) | `Protocol.tsx:247-274` | uses current preview `r`; `gas = simulateGasLimit(r.gasUsed, r.rounds)`; `confirmCost(gas)`; `sendTx(engineFor(assetId), encode(simulate,[scenario]), gas, setStatus)`; decodes `SimulationDone` from logs → `{hash, ms, sync}` + status string | 1 tx (MON) + funding | `lib/chain/actions/proveScenario.ts` |
| `narrate(r, asset, settings, scale)` | `Protocol.tsx:118-143` | → Turkish story string (branches: no liquidations / feedback>0 spiral / recovery >= 5000 vs thin arbitrage / bad debt / stuck debt) | none | `lib/chain/narrate.ts` (pure) |
| `sym(a)` | `Protocol.tsx:114` | strips `-8OCT2026` from symbol | none | `lib/chain/labels.ts` |
| `ethEstimate(r)` | `LimitGauge.tsx:27-32` | Result → Ethereum gas estimate: `gasUsed - (n*100 + ceil(n/128)*8000) + n*2100 + ethMemoryGas(mem) - monadMemoryGas(mem)` | none | `lib/kaskad/math.ts`-adjacent → `lib/chain/ethEstimate.ts` |
| `MC` type, `SEED=1n`, `MAX_PATHS=2000` | `MonteCarlo.tsx:18-35` | | | `lib/chain/monteCarlo.ts` |
| `previewMC(s, paths)` | `MonteCarlo.tsx:37-48` | → `MC \| null` (null = does not fit 30M gas or invalid, or no kaskadMC) | 1 eth_call to kaskadMC | `lib/chain/monteCarlo.ts` |
| MC debounced loader | `MonteCarlo.tsx:68-81` | base Scenario + paths → `r` (800 ms debounce, key-derived freshness) | 1 eth_call | `lib/chain/hooks/useMonteCarlo.ts` |
| `findLimit()` | `MonteCarlo.tsx:85-101` | binary search K in `[0, 2000]` → `{k, r}` (largest K that fits 30M) | ~11 sequential eth_calls | `lib/chain/monteCarlo.ts` (`findMaxPaths`) |
| `prove()` | `MonteCarlo.tsx:103-119` | `gas = monteCarloGasLimit(r.gasUsed)`; `confirmCost`; `sendTx(kaskadMC, encode(simulateMC,[base, paths, SEED]), gas)` | 1 tx | `lib/chain/actions/proveMonteCarlo.ts` |
| MC scatter data | `MonteCarlo.tsx:122-125` | `{shock: shockBps/100, bad: wadToNum(badDebt)/1e6}` | none | `lib/chain/monteCarlo.ts` |
| `MarketState`, `BORROW_GAS=80_000n` | `GuardPanel.tsx:16-17` | | | `lib/chain/guard.ts` |
| `readMarket(address)` | `GuardPanel.tsx:19-27` | → `{paused, maxLtvBps, borrowed}` | 3 batched eth_calls (no Multicall3 needed) | `lib/chain/guard.ts` |
| Guard gas estimate | `GuardPanel.tsx:88-100` | `guard.scenario()` → `previewScenario` → `simulateGasLimit(gasUsed, rounds) + 150_000n` | 2 eth_calls once | `lib/chain/guard.ts` (`guardGasLimit()`) |
| Market polling | `GuardPanel.tsx:102-117` | both markets every 6 s (first run via `setTimeout(…,0)`) | 6 eth_calls / 6 s | `lib/chain/hooks/useGuardMarkets.ts` |
| `runGuard()` | `GuardPanel.tsx:119-137` | re-reads scenario, previews, computes gas, `confirmCost`, `sendTx(guard, encode(refresh))`, re-reads markets | 2 eth_calls + 1 tx | `lib/chain/actions/runGuard.ts` |
| `borrow(market, setMsg)` | `GuardPanel.tsx:139-163` | `publicClient.simulateContract(borrow(1000e18))` pre-check (reverts early with `BorrowIsPaused`), then `sendTx(market, …, 80_000n)`; maps error to "✗ Revert: BorrowIsPaused (Guard durdurdu)" | 1 eth_call + 1 tx | `lib/chain/actions/borrow.ts` |
| Compare rows + loader | `ComparePanel.tsx:10-52` | ROWS `[9 Monad, 15 Eth "aynı Maple döngüsü", 2 Monad, 14 Eth "aynı varlık, derin havuz", 13 Eth "derin likidite referansı", 5 Monad "ETH yatır, stablecoin borç al", 7 Eth "aynı klasik pozisyon"]`; same shock/feedback/steps/rounds, `maxPositions = realPositions`; 900 ms debounce; per-row `.catch(() => null)`. Derived `ratio = depthUsd / debtUsd` (`:79`) | 7 eth_calls per change (one JSON-RPC batch) | `lib/chain/hooks/useCompare.ts` |
| `fmtMon(gasLimit)` | `CostTag.tsx:9-12` | → "<0,01 MON" / "~x,xx MON" | none | `lib/chain/cost.ts` |
| `confirmCost(gasLimit)` | `CostTag.tsx:30-35` | `monCost >= 1` → `window.confirm(...)` with payer text; else true | blocking browser dialog | `lib/chain/cost.ts` (make the confirm UI injectable, keep the 1 MON rule) |
| CostTag payer logic | `CostTag.tsx:15-27` | signer kind → "sponsor öder" / "senin cüzdanından"; heavy if >= 1 MON | none | `lib/chain/cost.ts` |
| `useSigner()` | `components/ui/use-signer.ts:10-12` | `useSyncExternalStore(signerStore…)` with stable server snapshot | none | `lib/chain/hooks/useSigner.ts` |
| SignerBadge text | `SignerBadge.tsx:10-21` | `address ? "${signerLabel[kind]} · ${shortAddr}" : "Cüzdan bağla"`, links `/baglan` | none | keep logic, restyle |
| `SAMPLES` | `cuzdan/Wallet.tsx:15-18` | 2 sample mainnet borrower addresses (largest syrupUSDC, largest PT-AUSD) | - | `lib/chain/samples.ts` |
| `cascadeFor(assetId, shockBps=300)` | `Wallet.tsx:21-32` | real book, steps 20, rounds 3, feedback 0 → `Result \| null` | 1 eth_call | `lib/chain/wallet.ts` |
| Headline cascade | `Wallet.tsx:44-46` | `cascadeFor(9, 2000)` on mount (syrupUSDC −20%) | 1 eth_call | `lib/chain/hooks/useWalletRisk.ts` |
| `lookup(addr)` | `Wallet.tsx:48-67` | validates with `isAddress`; `GET /api/position?address=` → `UserPosition`; then `cascadeFor(dominant.id)` | 1 fetch + 1 eth_call | `lib/chain/wallet.ts` (`fetchPosition`) |
| `mera()` / `injected()` (read-only) | `Wallet.tsx:69-86` | passkey or `eth_requestAccounts` → address → `lookup` (does not switch signer, no chain switch) | wallet prompt | `lib/chain/wallet.ts` |
| Wallet derived risk | `Wallet.tsx:88-96` | `threshold = depegToLiquidation(d.suppliedUsd, otherLtAdjustedUsd, d.ltBps, debtUsd)` (only if `debtUsd > 1`); `cascadeDrop = 1 - final/start`; `supplied = reserves.suppliedUsd > 1`; `lendSide = utilization > 0.01`; `badShare = lendUsd / protocol.suppliedUsd * headline.badDebt` | none | `lib/chain/wallet.ts` (pure `walletRisk()`) |
| Survive suggestions | `Wallet.tsx:214, 220` | `collateralToSurvive` / `repayToSurvive` with slider shock (1..30 %, default 5) and HF target 1.05 | none | same |
| Connect `refresh()` | `baglan/Connect.tsx:69-79` | burner address + balances of burner/injected/mera; `GET /api/fund` → `{address, balanceWei, spendableWei}` | up to 3 eth_getBalance + 1 fetch; polled every 10 s (`:81-88`) | `lib/chain/hooks/useSignerBalances.ts`, `lib/chain/sponsor.ts` |
| Connect `run(fn, set)` | `Connect.tsx:90-100` | wraps `connectInjected` / `connectMeraSigner` with busy + error message | wallet prompts | hook |
| Sponsor low flag | `Connect.tsx:102-103` | `spendableWei < 3 MON` | none | `lib/chain/sponsor.ts` |
| `TransactionFeedback` | `components/ui/feedback.tsx:8-15` | toast by regex on status text: error if `/Hata:\|revert/i`, success if `/doğrulandı\|Zincirde:\|Guard çalıştı\|borç verildi/` | toast | Keep regexes in sync with status strings, or switch to typed status objects in the new layer. |

---

## 4. API routes

| Route | Method | Input validation | Rate limit (in-memory, per server instance) | Env vars | Response |
|---|---|---|---|---|---|
| `/api/rpc` (`app/api/rpc/route.ts`) | POST | JSON body, single or batch of 1..20 calls; every `method` must be in the allowlist: `eth_chainId, eth_blockNumber, eth_call, eth_getBalance, eth_getTransactionCount, eth_getTransactionReceipt, eth_getTransactionByHash, eth_sendRawTransaction, eth_sendRawTransactionSync` | 60 requests / 10 s per IP (`x-forwarded-for` first hop, else "local"); a batch counts as one | `MONAD_TESTNET_RPC` | Upstream body/status passed through. 503 `{error}` if unconfigured, 429 `{error}`, 400 `{error:"geçersiz istek"/"geçersiz batch"}`, disallowed method → HTTP 200 `{jsonrpc, id, error:{code:-32601,"method not allowed"}}` |
| `/api/fund` (`app/api/fund/route.ts`) | GET | none | none | `SPONSOR_PRIVATE_KEY`, `MONAD_TESTNET_RPC` | `{address, balanceWei, spendableWei, reserveWei}` (strings); 503 if unconfigured |
| `/api/fund` | POST | JSON `{address, needWei?}`; `isAddress(non-strict)`; `needWei` must match `^\d{1,30}$` else default 0.3 MON | 8 / 10 min per IP and 3 / 10 min per address | same | `{txHash: string\|null, amount: weiString}` (`null`/"0" if already funded). Grant = 1.2 x shortfall clamped to [0.3, 4] MON; refuses if recipient already >= 4 MON (400) or sponsor would dip below **10 MON reserve** (503). Serialized queue; 21k gas; `sendRawSync`. Errors `{error}` 400/429/503/500 |
| `/api/position` (`app/api/position/route.ts`) | GET `?address=` | `isAddress(non-strict)`, then `getAddress` | 20 / 60 s per IP | `MONAD_MAINNET_RPC` | `UserPosition` JSON; 503 unconfigured, 400 bad address, 429, 502 `{error:"mainnet okuması başarısız"}`. 20 s RPC timeout, chain = Monad mainnet |

---

## 5. User-visible features the new UI must keep

### 5.1 Presets (`Protocol.tsx:45-112`)
Base: `{assetId: 9 (syrupUSDC), shockPct: 3, steps: 20, rounds: 3, feedback: 0, calibrated: false, resolution: 10000}`. Default selected: `sali`.
Presets are hidden if their asset is missing from `DEPLOYMENT.assets` (`:195`). Short card copy lives at `:281-282`.

| id | Title (long / short) | Settings (diff from base) | Story text |
|---|---|---|---|
| `ufak` | Ufak sarsıntı | `shockPct 0.3` | syrupUSDC borsada %0,3 kayıyor… |
| `sali` | Salı Depegi / Salı depegi | base (syrupUSDC −3 %, feedback 0) | syrupUSDC %3 düşüyor. Havuz o kadar sığ ki… |
| `worst` | En kötü durum: oracle havuza bağlı | `feedback 10000` | Aynı %3, ama oracle anlık DEX fiyatını izlese… |
| `pt` | PT vade telaşı | `assetId 12, shockPct 1` | Vadesine 12 gün kalan PT-AUSD %1 iskontoya düşüyor. |
| `maple-eth` | Aynı döngü, Ethereum'da / Ethereum döngüsü | `assetId 15` | …syrupUSDT borçluları… $98,8M borç… |
| `eth` | ETH %20 çakılırsa / ETH %20 düşerse | `assetId 7, shockPct 20` | …Ethereum Aave'de $513M borç… |
| `derin` | Derin havuz: USDC | `assetId 13, shockPct 10` | Ethereum'da USDC teminatı %10 düşüyor… |
| `stres` | 10.000 pozisyon stres testi | `calibrated true, resolution 10000` | Gerçek dağılımdan 10.000 pozisyon, tek tx. Ethereum'a sığmaz. |

Any manual change clears the selected preset (`set()` at `:196-199`).

### 5.2 Settings
- Asset picker: featured `[9, 5]` buttons (with collateralUsd) + select of other `UI_ASSETS` tagged Ethereum/Monad (`:318-323`).
- Shock slider 0..50 % step 0.1 + chips `[0.1, 0.5, 1, 3, 5, 10, 20, 30]` (`:324-328`).
- Oracle source: `0` "Dış fiyat (Chainlink / kur)" vs `10000` "Anlık havuz fiyatı" (`:329`).
- Advanced (`:330-336`): steps 1..100 blocks, rounds/block 1..20, book real vs calibrated (only if `calibratedPositions > 0`), resolution from `RESOLUTIONS <= calibratedPositions`.
- Info rows: pool depth + measured/assumption + `depthNote`; arbitrage recovery % + `why` (real book only); Ethereum-data note; PT maturity note.

### 5.3 Results (`:343-357`)
Status header; bad debt and "anında likide edilemeyen" (stuck) counters with % of total debt (scaled on calibrated books); error alert;
"Ne oldu?" narrative (`narrate`); stats: liquidated, total debt, liquidations/waves, final price (red if < 50 % of start);
per-block DominoCascade + CascadeChart (or "Bu şokta likidasyon yok."); proof row: preview ms or tx ms, positionsUsed, signer link;
"Zincirde kanıtla" button + CostTag; tx status with ms, sync/async, MonadScan link. Hero terminal mirrors positions, bad debt, ms, tx hash.

### 5.4 Other features
- **Cascade / timeline**: `blockTimeline` per block (all blocks shown, stalled note when liquidations stop early with stuck debt: `DominoCascade.tsx:48-53`).
- **Limit gauge** (`LimitGauge.tsx`): Monad gas vs 30M, memory vs 8 MB; Ethereum estimate vs 2^24 cap, x-times ratio; memory gas both chains.
- **Monte Carlo** (`MonteCarlo.tsx`): K slider (1..100, or 1..found limit), mean / p95 / worst (with its shock) / loss-path share, scatter, gas & memory bars, "Sınırı bul" (free, binary search), "Zincirde kanıtla" (simulateMC). Hidden if no `kaskadMC`.
- **Compare panel** (`ComparePanel.tsx`): 7 books, same shock, debt, depth (+assumption), depth/debt ratio, bad debt, stuck debt.
- **Stress curve** (`Protocol.tsx:364`, `Charts.CurveChart`): bad debt vs 8 shocks, both oracle modes.
- **Guard** (`GuardPanel.tsx`): market A vs B status (paused, max LTV), "Borç almayı dene" per market, "Guard'ı çalıştır", tx link.
- **Cost tags + confirm**: every tx button shows MON cost + payer; free actions show "ücretsiz (eth_call, zincire yazmaz)"; confirm dialog at >= 1 MON.
- **Wallet tab "Param güvende mi?"** (`/cuzdan`): address input + 2 samples + Mera + browser wallet lookup; borrow side (HF, collateral, debt, liquidation threshold %, cascade impact, survive sliders); supply side (utilization table, withdrawal risk, approximate loss share from −20 % syrupUSDC headline).
- **Connect tab** (`/baglan`): active signer, sponsor spendable budget (low warning < 3 MON), 3 signer cards with address + balance, faucet link.
- **Signer badge** in nav.
- **Market strip** (`Protocol.tsx:289-297`): total supplied, total debt, positions, syrupUSDC collateral + LT, source block.

### 5.5 Honesty labels / assumption copy (keep all)
| Where | Text (Turkish, verbatim or template) |
|---|---|
| `Protocol.tsx:296` | "Gerçek veri · Monad mainnet Aave" · "Blok #{source.block} · Envio HyperSync + multicall" |
| `Protocol.tsx:314` | badge "Kalibre veri" / "Gerçek Aave pozisyonları" |
| `Protocol.tsx:329` | option hints "Aave'nin kullandığı model" / "en kötü durum" |
| `Protocol.tsx:337` | depth badge "varsayım" / "ölçüldü" + Help = `asset.depthNote` |
| `Protocol.tsx:338` | "Arbitraj toparlanması" + "varsayım" + Help = `RECOVERY_BPS[id].why` or "Toparlanma yok." |
| `Protocol.tsx:339-340` | "Ethereum verisi · Monad simülasyonu"; "PT-AUSD vadesi · 8 Ekim 2026" |
| `Protocol.tsx:344` | " · en kötü durum" / " · dış fiyat" |
| `Protocol.tsx:346-347` | Help "Tüm teminat satılsa bile kapanmayan borç açığı." / "Havuz likiditesi yetersiz olduğu için kapatılamayan riskli borç."; " · ölçeklendi" on calibrated |
| `Protocol.tsx:355` | "Ücretsiz önizleme · eth_call" vs "Zincirdeki işlem süresi" |
| `Protocol.tsx:364` | Help "Yeşil: dış fiyat oracle. Kırmızı: anlık havuz oracle, en kötü durum."; "Ücretsiz · tek eth_call / oracle" |
| `Protocol.tsx:118-143` | `narrate()` oracle/arbitrage explanations |
| `Charts.tsx:73-74` | legend "Anlık havuz · en kötü durum" / "Dış fiyat · gerçekçi" |
| `LimitGauge.tsx:43` | "Tahmini hesap · ethEstimate" |
| `LimitGauge.tsx:46` | Details: Monad measured in-engine; Ethereum estimate = 2.100 cold SLOAD/slot + quadratic memory, "fork ölçümüyle ±%1 doğrulandı"; memory formulas; MIP-8 page costs; contract size 128 KB vs 24 KB |
| `MonteCarlo.tsx:133-135` | Help "her senaryo: son düşüş = ortalama %X × 3u² (en fazla 3 katı), rastgele yol" |
| `MonteCarlo.tsx:200-204` | Details: memory does not grow with K (96 bytes/path), gas is the limit |
| `MonteCarlo.tsx:207, 228` | "Bu K 30M gas'a sığmıyor; K'yı azalt." / "30M gas için en büyük K · ikili arama" |
| `ComparePanel.tsx:60` | "· hesap Monad'da"; `:70` th title "Satışların gittiği havuzun, riskteki borca oranı"; `:92` "varsayım" |
| `ComparePanel.tsx:105-109` | Details on depth-to-debt ratio |
| `CostTag.tsx:18-24, 34` | "ücretsiz (eth_call, zincire yazmaz)", "maliyet hesaplanıyor…", "{cost} · testnet, sponsor öder/senin cüzdanından", " · pahalı işlem", confirm text |
| `GuardPanel.tsx:170, 211-214` | "syrupUSDC −%3 · en kötü durum · eşik %0,5"; Details: anyone can call refresh, pauses B and cuts max LTV to %70 |
| `Wallet.tsx:106` | "Salt okunur" |
| `Wallet.tsx:183-186` | Help: dominant collateral; "diğer teminatlar sabit fiyatlı sayılır" |
| `Wallet.tsx:191` | "Kaskad senaryosu ({sym} −%3, gerçek defter)" |
| `Wallet.tsx:207` | "Koruma hedefi · {sym} · HF ≥ 1,05" |
| `Wallet.tsx:258` | "teminat (borç verilmiyor)" |
| `Wallet.tsx:267-272` | "syrupUSDC −%20 kaskadında…"; "Yaklaşım: … (Aave'de önce Umbrella/rezervler karşılar)" |
| `Wallet.tsx:276-279` | "Çekim riski nasıl hesaplandı?" explanation |
| `Connect.tsx:116` | Help "10 MON rezerv hariçtir. …" |
| `Connect.tsx:177-178` | "Önizlemeler ücretsiz; cüzdan gerektirmez."; Details "İmzalama ve ücretler" (Monad charges the limit, Mera key only in memory, testnet MON) |
| `Hero.tsx:16, 25` | "Gerçek Aave verisi", "Ücretsiz önizleme", "eth_call · zincirde kanıt bekleniyor" |
| `DominoCascade.tsx:48-53` | stall note "…havuzda kârlı satış kalmadı…" |
| `useKaskad.ts:97-99` | preview error texts |
| `layout.tsx:24` | footer "Monad · Aave verisi · Envio HyperSync · Alchemy · Mera", "Monad testnet" |
| data | `deployment.json` `depthNote` per asset; `recovery.ts` `why` per asset |

---

## 6. Hardcoded numbers in UI files (not computed)

The example stats "$111M", "57 positions" appear only in `design-review/VERIFICATION.md:7`, not in UI code; "309 ms" and "$1,6M" were not found in `web/`.

| file:line | Literal | Derivable from |
|---|---|---|
| `Protocol.tsx:81` | "Vadesine **12 gün** kalan PT-AUSD" | Time-dependent; maturity (8 Oct 2026) minus a date. Goes stale. |
| `Protocol.tsx:88` | "**$98,8M** borç" | `DEPLOYMENT.assets[15].debtUsd` |
| `Protocol.tsx:95` | "**$513M** borç" | `DEPLOYMENT.assets[7].debtUsd` |
| `Protocol.tsx:60,67,74,81,94,102` + `:282` | "%0,3", "%3", "%1", "%20", "%10" in story/short text | the preset's own `shockPct` |
| `Protocol.tsx:108-109, 281-282` | "10.000 pozisyon" | `assets[9].calibratedPositions` / preset `resolution` |
| `Protocol.tsx:340` | "8 Ekim 2026" | symbol suffix `-8OCT2026` of asset 12 |
| `Protocol.tsx:320-322` | featured assets `[9,5]`, glyphs "$"/"Ξ" | config choice |
| `Protocol.tsx:27` | `CURVE_SHOCKS [10..3000]` | config choice |
| `Protocol.tsx:29` | `ETH_BOOKS [7,13,14,15]` | duplicated in `config.ts:33` comment; could be a field |
| `Protocol.tsx:326-327` | slider 0..50, chips `[0.1,…,30]` | UI choice |
| `LimitGauge.tsx:42` | "/ 30M gas", "/ 8 MB" | `MONAD_TX_GAS_LIMIT`, `MONAD_MEMORY_LIMIT` |
| `LimitGauge.tsx:43` | "/ 16,78M gas" | `ETH_TX_GAS_CAP` |
| `LimitGauge.tsx:30` | `100`, `8_000` (MIP-8 warm/page cost) | not in math.ts; should be constants there |
| `LimitGauge.tsx:46` | "2.100", "8.100 gas", "100 gas", "128 slot", "±%1", "128 KB", "24 KB" | first three from math constants; "±%1" is a measured claim; contract size limits not in lib |
| `MonteCarlo.tsx:181, 192` | "/ 30M", "/ 8 MB" | constants |
| `MonteCarlo.tsx:35, 60, 143` | `MAX_PATHS 2000`, default K `30`, slider max `100` | `kaskadMC.MAX_PATHS()` view exists |
| `MonteCarlo.tsx:134` | "3u² (en fazla 3 katı)" | contract model constant (not exposed) |
| `MonteCarlo.tsx:202` | "96 byte" | contract detail |
| `ComparePanel.tsx:106-108` | "~48 kat derin", "11 kat büyük", "%10'luk düşüş" | `assets[14].depthUsd / assets[2].depthUsd` (≈47.8), `assets[14].debtUsd / assets[2].debtUsd` (≈11.0) |
| `GuardPanel.tsx:170` | "syrupUSDC −%3 · en kötü durum · eşik %0,5" | `guard.scenario()` + `guard.badDebtThresholdBps()` |
| `GuardPanel.tsx:213` | "maks. LTV'yi %70'e" | `guard.safeLtvBps()` |
| `GuardPanel.tsx:17, 94, 126` | `80_000n` borrow gas, `+150_000n` guard overhead | tx sizing constants |
| `GuardPanel.tsx:147-155` | borrow `1_000n * 10n**18n`, "1.000 birim" | constant |
| `GuardPanel.tsx:112` | poll `6_000` ms | |
| `CostTag.tsx:11, 20, 32` | `0.01`, `1` MON thresholds | policy |
| `Connect.tsx:103` | sponsor low `< 3 MON` | policy |
| `Connect.tsx:116` | "10 MON rezerv" | `/api/fund` GET returns `reserveWei` |
| `Connect.tsx:14, 83` | faucet URL, poll `10_000` ms | |
| `Wallet.tsx:16-17` | two sample addresses | curated |
| `Wallet.tsx:21-30` | `shockBps 300`, `steps 20`, `rounds 3`, `feedback 0` | mirrors Protocol BASE; should import it |
| `Wallet.tsx:45, 267` | `cascadeFor(9, 2000)` and "−%20" copy | same constant, keep in one place |
| `Wallet.tsx:191` | "−%3" copy | `cascadeFor` default |
| `Wallet.tsx:39, 210` | default 5 %, slider 1..30 | UI choice |
| `Wallet.tsx:155, 207` | HF `1.05` | math.ts default `target` |
| `Wallet.tsx:90, 93-94, 251-255` | `debtUsd > 1`, `suppliedUsd > 1`, utilization `0.01` / `0.9` | thresholds |
| `Hero.tsx:23` | 20 decorative bar heights | decoration only |
| debounces | `useKaskad.ts:102` 600 ms, `MonteCarlo.tsx:74` 800 ms, `ComparePanel.tsx:45` 900 ms | RPC budget |

---

## 7. Environment variables (names only)

| Name | Scope | Used in | Purpose |
|---|---|---|---|
| `MONAD_TESTNET_RPC` | server-only | `app/api/rpc/route.ts:21`, `app/api/fund/route.ts:35,51` | Upstream keyed testnet RPC |
| `MONAD_MAINNET_RPC` | server-only | `app/api/position/route.ts:9` | Mainnet RPC for Aave reads |
| `SPONSOR_PRIVATE_KEY` | server-only (secret) | `app/api/fund/route.ts:34,50` | Gas sponsor signer |
| `NEXT_PUBLIC_MONAD_TESTNET_RPC` | client (inlined at build) | `lib/kaskad/config.ts:39` | Optional override (e.g. local anvil). If set, the browser bypasses `/api/rpc`; never put a keyed URL here. |

`web/.env.local` defines the three server-only vars. No other env vars are read in `web/`.

---

## 8. Gotchas

- **Next 16** (`web/AGENTS.md`): "This is NOT the Next.js you know"; read `node_modules/next/dist/docs/` before writing code (upgrade notes in `01-app/02-guides/upgrading/version-16.md`: Turbopack default, async request APIs (`params`/`searchParams`/`cookies`/`headers` are Promises), `middleware` renamed to `proxy`, `next lint` removed (use `eslint`), React 19.2, new caching APIs). `AGENTS.md`'s block is re-added by `next dev`; commit it rather than fighting the diff.
- **ESLint** (`eslint.config.mjs`): `eslint-config-next` core-web-vitals + typescript, with `eslint-plugin-react-hooks` 7.1.1, whose `react-hooks/set-state-in-effect` rule flags synchronous `setState` inside `useEffect`. Existing workarounds: derive `loading`/freshness from a request key (`usePreview`, MonteCarlo, ComparePanel, stress curve) and start pollers with `setTimeout(fn, 0)` (`GuardPanel.tsx:111`, `Connect.tsx:82`). `react/no-unescaped-entities` is **off** (Turkish apostrophes). One `exhaustive-deps` disable at `ComparePanel.tsx:51`.
- **eth_call gas cap**: every preview passes `gas: 30_000_000n` (`MONAD_TX_GAS_LIMIT`), so "preview succeeds" means "fits in one tx". Out-of-gas is how "doesn't fit" is detected (`usePreview` message, `previewMC` returns null, `findLimit` binary search). Do not remove the explicit gas.
- **Monad charges the gas limit**, not gas used: cost = limit x price is known before sending. Limits come from `simulateGasLimit` / `monteCarloGasLimit` (capped at 30M), guard = +150k, borrow = 80k. Display uses 102 gwei (`CHARGED_GWEI`); balance checks and funding use `MAX_FEE_PER_GAS` = 150 gwei. `confirmCost` gates anything >= 1 MON.
- **Sponsor 10 MON reserve**: `/api/fund` never lets the sponsor drop below 10 MON (Monad keeps a reserve per EOA); GET exposes `reserveWei` and `spendableWei`. Grants 0.3..4 MON; newly funded burners wait for the balance to show up (~3 blocks) before sending.
- **RPC proxy allowlist**: only the 9 methods listed in section 4. No `eth_getLogs`, `eth_estimateGas`, `eth_getBlockByNumber`, `eth_gasPrice`, `eth_feeHistory`, `eth_maxPriorityFeePerGas`. That is why fees and gas are fixed client-side and results come from receipts / eth_call, not logs. Batches > 20 calls are rejected with 400, and viem's `http({batch:true})` default batch size is larger, so keep concurrent calls per tick under 20 (today max is ~7 in ComparePanel). 60 req / 10 s per IP.
- **engineFor + ABI**: `preview`/`simulate` are encoded with `kaskadAbi` but may be sent to `kaskadMC` (same selectors). Calibrated ids (>= 256) must go to `kaskad`.
- **Signer state** lives in module memory: page reload resets to burner; the Mera signer needs a new passkey prompt. Injected-wallet txs go through the wallet's own RPC (not the proxy); receipts are read through the proxy.
- **Burner key** is stored in plain `localStorage` (testnet only, by design). `signerStore.get()` creates it on first read.
- **Toast classification** depends on Turkish substrings in status messages (`feedback.tsx:11-12`); changing message text silently changes toast type.
- **Scripts depend on `lib/kaskad/*`** (`load-testnet.ts`, `smoke.ts`, `measure-all.ts`, `reset-guard.ts`, `set-recovery.ts`, `export-abi.ts`); keep paths and exports stable.
- **Rate limits are in-memory** per server instance (reset on cold start; not shared across instances).
- `/api/position` reads Monad **mainnet** (Multicall3 required); everything else is testnet. The Guard `Details` text shows `DEPLOYMENT.contracts.kaskad` as the engine rather than reading `guard.engine()`.
