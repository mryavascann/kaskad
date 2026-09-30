# lib/chain: typed wrappers over the chain layer

The new pages call only this folder. It wraps `lib/kaskad/*` (unchanged: scripts import it) and the
orchestration that used to live in the legacy UI files (`app/_components/*`, `app/(legacy)/*`).
Rules it follows:

- **Behavior-identical.** Math, gas limits, debounces and error detection are copied, with the source
  `file:line` in a comment. Only types and structure changed.
- **No copy.** Functions return codes and numbers; pages render English or Turkish. Strings that are
  *data* (`AssetInfo.depthNote`, `RECOVERY_BPS[id].why`) are passed through as-is.
- **No literal metrics.** Numbers come from chain results, `deployment.json` or named constants
  with a source comment.
- **No barrel.** Import per file. Pure modules have no directive and also run in Server Components.
  Modules that touch the signer have `"use client"`.

## Modules

| File | Exports | Wraps |
|---|---|---|
| `types.ts` | `Scenario`, `RoundLog`, `Result`, `CurveResult`, `MonteCarloResult`, `MarketState`, `Settings`, `OracleMode`, `BookChain`, `BookKind` | `useKaskad.ts:9-43`, `MonteCarlo.tsx:18-32`, `GuardPanel.tsx:16`, `Protocol.tsx:33-41` |
| `deployment.ts` | re-exports `DEPLOYMENT`, `CALIBRATED`, `RESOLUTIONS`, `UI_ASSETS`, `txUrl`, `addrUrl`, `wadToNum`; `CONTRACTS`, `assetInfo(id)`, `allAssets()`, `marketOverview()` | `lib/kaskad/config.ts`, `Protocol.tsx:289-297` |
| `reader.ts` | `ChainReader` (the read surface), `defaultReader()`, `MAX_BATCH_CALLS` | same config as `burner.ts:12-15` publicClient, but isomorphic and with batches split at 20 calls |
| `engine.ts` | `engineFor`, `previewScenario`, `previewCurve`, `previewError`, `previewMonteCarlo`, `findMaxPaths`, `monteCarloFacts`, `PREVIEW_GAS`, `MC_*` constants | `useKaskad.ts:45-74, 96-99`, `MonteCarlo.tsx:34-48, 84-101, 122-125` |
| `scenario.ts` | `BASE_SETTINGS`, `PRESETS`, `presetById`, `visiblePresets`, `matchPreset`, `presetFacts(id, now)`, `buildScenario`, `monteCarloBase`, `stressCurveScenarios`, `compareParams`, `calibratedScale`, `resultFacts`, `symbol`, `symbolParts`, `isEthereumBook`, `ETH_BOOKS`, `daysToMaturity`, `assetFacts`, `pickerAssets`, UI ranges | `Protocol.tsx:27-114, 195-245, 318-364` |
| `narrative.ts` | `narrativeFacts(result, asset, settings, scale)` -> `NarrativeFacts` | `narrate()` `Protocol.tsx:117-143` |
| `timeline.ts` | `cascadeTimeline(result, scenario)` (+ `stalled`) | `lib/kaskad/timeline.ts`, `DominoCascade.tsx:19` |
| `limits.ts` | `ethEstimate`, `limitFacts`, `monadBookReadGas`, `MIP8_*`, `MONAD_READ_GAS_PER_POSITION`, `ETH_READ_GAS_PER_POSITION` | `LimitGauge.tsx:26-47` |
| `compare.ts` | `COMPARE_ROWS` (role codes), `compareRows()`, `compareScenario`, `compareResultFacts`, `compareNotes()` | `ComparePanel.tsx:10-109` |
| `guard.ts` | `readMarket(s)`, `readGuardConfig`, `readGuardScenario`, `guardGasLimit`, `guardGasFromPreview`, `guardVerdict`, `guardEffect`, `MARKETS`, `BORROW_GAS`, `BORROW_AMOUNT`, `GUARD_TX_OVERHEAD_GAS`, `GUARD_POLL_MS` | `GuardPanel.tsx:16-163`, `Guard.sol:58-65` |
| `wallet.ts` | `SAMPLES`, `walletCascadeScenario`, `cascadeFor`, `fetchPosition`, `walletRisk`, `surviveSuggestions`, thresholds | `Wallet.tsx:15-96, 149-259` |
| `wallet-client.ts` (client) | `readMeraAddress`, `readInjectedAddress` (read only, signer unchanged) | `Wallet.tsx:69-86` |
| `cost.ts` | `quoteCost`, `payerFor`, `needsConfirm`, `decideCost`, `ConfirmCost`, `MIN_DISPLAY_MON`, `CONFIRM_THRESHOLD_MON` | `CostTag.tsx:9-35` |
| `sponsor.ts` | `fetchSponsor`, `isSponsorLow`, `SPONSOR_LOW_WEI`, `FAUCET_URL`, `BALANCE_POLL_MS` | `Connect.tsx:14, 69-103` |
| `status.ts` | `toTxEvent`, `txError`, `fundingFailure`, `connectError`, verbatim `SIGNER_STATUS` / `SIGNER_ERRORS` / `FUND_ROUTE_ERRORS` | `burner.ts:44-62`, `signer.ts:47-157`, `api/fund/route.ts` |
| `tx.ts` (client) | `runTx`, `TxOptions`, `TxOutcome` | `sendTx` `signer.ts:103-160` (called unchanged) |
| `actions/*.ts` (client) | `proveScenario`, `proveMonteCarlo`, `runGuard`, `borrow` (+ event decoders) | `Protocol.tsx:247-274`, `MonteCarlo.tsx:103-119`, `GuardPanel.tsx:119-163` |
| `replay.ts` | `replay(book, scenario)`: exact off-chain mirror of the engine, per position | `contracts/src/Kaskad.sol:200-484`, `KaskadMC.sol:203-245` |
| `book.ts` | `readBook`, `readBookCached`, `classifyPositions`, `compareWithEngine`, `canClassify`, `BOOK_READ_MAX` | `PositionBook.sol:135-147` views + `lib/kaskad/pack.ts` |
| `finding.ts` | `findingScenario`, `findingFacts`, `fetchFinding`, `fetchFindingPositions` | landing finding (below) |
| `poll.ts` | `pollWhileVisible(tick, ms)`, `MIN_POLL_MS` | `GuardPanel.tsx:110-117`, `Connect.tsx:81-88` |
| `hooks/*` (client) | `usePreview`, `useStressCurve`, `useMonteCarlo`, `useCompare`, `useGuardMarkets`, `useGuardConfig`, `useSigner`, `useSignerBalances`, `useSignerConnect`, `useWalletRisk`, `useLiveBlock`, `useFinding`, `usePositionMap` | `useKaskad.ts:76-107`, `Protocol.tsx:220-241`, `MonteCarlo.tsx:68-101`, `ComparePanel.tsx:30-54`, `GuardPanel.tsx:87-117`, `use-signer.ts`, `Connect.tsx:69-100`, `Wallet.tsx:34-96`; `useLiveBlock` is new |

Every read takes an optional `reader` (tests pass a stub; a Server Component can pass nothing and gets
`defaultReader()`, which uses the public testnet RPC on the server and `/api/rpc` in the browser).

## The finding (landing)

Preset `sali`: syrupUSDC -3 %, real book (all 57 positions), 20 blocks, 3 waves per block, external
oracle (feedback 0), on KaskadMC. The README numbers map to the engine `Result`
(`contracts/src/Kaskad.sol:44-59`, `_badDebt` at `:466-484`):

| Finding | Field | Meaning |
|---|---|---|
| debt that can't be liquidated instantly (~$111.0M) | `stuckDebt` | debt of positions under HF 1 at the end with no shortfall: an instant-sale liquidator cannot profit |
| what the ~$7M pool lets a liquidator clear (~$134K) | `totalLiquidated` | debt repaid by liquidators selling seized collateral into the pool up to break-even |
| ratio (~829x) | `stuckDebt / totalLiquidated` | |
| bad debt ($0) | `badDebt` | shortfall after all collateral |
| pool depth ($7.04M, measured) | `deployment.json` `assets[9].depthUsd` / `depthIsAssumption` / `depthNote` | |

`fetchFinding()` = `eth_blockNumber` + one `preview` pinned to that block (2 requests).

**Observed** (public RPC, block **66,989,757**, 2026-09-30 14:00:57 UTC): `stuckDebt` $110,987,638.08,
`totalLiquidated` $133,890.84, ratio **828.94**, `badDebt` $0, `totalDebt` $123,685,701.86 (stuck share
89.7 %), 1 liquidation in 1 wave (block 7, oracle $1.172318), 57 positions, engine gas 387,554,
memory 29,632 bytes, price $1.184758 -> $1.149215.

### Per-position tiles ("30 positions below threshold")

The engine only logs per-wave totals, so `replay.ts` mirrors `_load` / `_initPool` / `_cascade` /
`_liquidate` / `_badDebt` in bigint (same floor division, same heap). `classifyPositions()` replays the
run and compares it with the on-chain preview **field by field** (11 totals and every wave); on any
difference it returns `{ consistent: false, mismatches }` instead of tiles.

Evidence: for the live finding above the replay matched exactly and gives **30 stuck** (their debt sums
to `stuckDebt` exactly), 27 safe, 0 bad debt. The one liquidation hit position #12 ($1.93M debt) in
block 7 for $133,891 (all of `totalLiquidated`); it is still under HF 1 (0.983), so it is one of the 30.
The largest borrower (#0, $30.66M = 24.8 % of the debt) becomes liquidatable after a 2.30 % drop.
The mirror also reproduced four more recorded previews exactly (`__fixtures__/engine-runs.json`, blocks
66,990,055 and 66,990,142): the pool-oracle spiral (46 liquidations, 42 waves, bad debt on 56 positions)
and USDe (Ethereum) -5 % with 50 % arbitrage recovery, both oracle modes. The tests replay them offline.

Outcomes (mutually exclusive): `bad-debt`, `stuck` (counted in `stuckDebt`, partly liquidated or not),
`liquidated` (hit at least once, healthy at the end), `safe`. `belowThreshold` = bad-debt + stuck.
Only real books up to `BOOK_READ_MAX` (400) positions are read slot by slot (one multicall, about 64
slots per eth_call; plain reads in batches of 10 without Multicall3).

### Chain vs deployment.json (same session, one multicall)

Price, depth, position count and debt of all 14 books equal `deployment.json`; `KaskadMC.recoveryBps`
equals `lib/kaskad/recovery.ts` (0 for the four unlisted assets); calibrated book 265 has 10,000
positions; `MAX_PATHS` 2,000; `sourceBlock` 108,133,182. Guard: scenario syrupUSDC -3 % with the pool
oracle, `badDebtThresholdBps` 50, `liquidationThresholdBps` 0, `safeLtvBps` 7,000, engine = Kaskad
(`0xdC2D…b661`), market = B. At that block market B was already paused with max LTV 70 %.

Budget of all live checks: 26 HTTP requests / 48 JSON-RPC calls (`eth_call`, `eth_blockNumber` only),
1.1 s apart, public RPC. No transactions.

## Typed codes

| Where | Codes |
|---|---|
| `TxEvent.step` | `preparing` (guard preview), `funding` (sponsor top-up), `signing` (`detail: mera | wallet`), `sending` (`detail: sync`), `confirming` (wallet tx, polling the receipt), `confirmed`, `failed` (`detail`: error code or `reverted`), `unknown` (unmapped string; `raw` keeps it) |
| `TxErrorCode` | `borrow-paused`, `out-of-gas`, `funding-failed` (`detail`: `rate-limited`, `sponsor-empty`, `already-funded`, `unconfigured`, `invalid-request`, `timeout`, `failed`), `insufficient-balance`, `no-wallet`, `mera-locked`, `rejected`, `rate-limited`, `unknown` |
| `TxOutcome.status` | `confirmed` (+ decoded event / markets), `reverted` (still costs MON), `cancelled` (`declined`, `confirm-required`, `unavailable`), `failed` |
| `PreviewErrorCode` | `out-of-gas`, `failed` (+ `raw`, `shortMessage`) |
| `PositionErrorCode` | `invalid-address`, `rate-limited`, `unconfigured`, `upstream`, `failed` |
| `ConnectErrorCode` | `no-wallet`, `rejected`, `failed` |
| `NarrativeFacts.kind` | `no-liquidations`, `cascade` (+ `oracle.kind` `spiral` / `external` with `arbitrage` `recovers` / `thin`, `outcome`, `stuck`) |
| other | `CompareRole`, `Payer` (`sponsor` / `wallet`), `ThresholdState`, `WithdrawState`, `PositionOutcome` |

The Turkish strings `sendTx` emits are matched exactly; `status.test.ts` fails if they change in
`lib/kaskad`. `raw` always carries the original string.

## Honesty fields the UI must show

`assetFacts(id).depth.{isAssumption,note,source}`, `.recovery.{bps,why}` (real book only),
`.chain` (Ethereum books are simulated on Monad), `BookKind` + `resultFacts().scaled` (calibrated =
synthetic sample, amounts scaled to the full book), `OracleMode` (`pool` = worst case),
`limitFacts().ethereum.gasEstimate` (an estimate), `Finding.depthIsAssumption/depthNote/sourceBlock`,
`marketOverview().source` (Monad mainnet Aave block), `guardVerdict` / `readGuardConfig` (live
threshold and safe LTV instead of the old "%0,5" / "%70" copy).

## RPC budget and rate limits

The proxy allows 60 requests / 10 s per IP and batches of at most 20 calls.

- `defaultReader()` splits JSON-RPC batches at 20 calls (viem's default is 1000), so no tick can
  produce a batch the proxy refuses.
- Debounces as before: preview 600 ms, Monte Carlo 800 ms, compare 900 ms. The stress curve had none
  (default 0 here); pass `{ debounceMs }` when steps / rounds come from a slider.
- Pollers pause while the tab is hidden, never run more often than once per second, and skip a tick
  while the previous one is in flight: `useLiveBlock` 1 call / 3 s, `useGuardMarkets` 6 calls / 6 s
  (one batch), `useSignerBalances` up to 3 calls + `GET /api/fund` / 10 s.
- Largest single tick from this layer: `useCompare` 7 calls. All pollers plus a compare reload in the
  same tick come to 17 calls, still one batch under 20.
- `findMaxPaths` makes about 11 sequential calls; `readBook` makes 1 batch of 4 plus one multicall.
- On the server `fetchFinding()` hits the public RPC: cache it (for example with `revalidate`).

## Tests

`npx vitest run lib/chain`: pure modules in node, hooks (`*.test.tsx`) in jsdom with fake timers.
Nothing touches the network or sends a transaction. Actions get an injected `send`, and readers are
stubs. `__fixtures__/engine-runs.json` holds real books and previews recorded read-only from Monad
testnet, so the engine mirror is checked against real chain output offline.
