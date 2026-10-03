# Kaskad risk workflow (Chainlink CRE)

A [Chainlink Runtime Environment](https://docs.chain.link/cre) workflow is the orchestration layer of Kaskad's risk pipeline on Monad testnet:

```
cron (every 15 min) ─┐
                     ├─► read books, oracle, markets, vault (2 Multicall3 eth_calls, free)
Kaskad book event  ──┘     preview the rule's trigger shock on KaskadMCv3
(AssetSet / PositionsLoaded / BookReset)
                           decide (decide.ts): does anything need to change?
                              │ no  → no report, no gas
                              │ yes → one signed report
                              ▼
          forwarder ─► KaskadCREReceiver.onReport
                         ├─ RiskOracle.publish(asset)    four shocks, hidden bad debt, bounded LTV step
                         ├─ GuardV2.refresh()            pause / reopen the markets
                         └─ RiskVault.rebalance()        ERC-4626 vault leaves the flagged market
```

The workflow mirrors the contracts' decisions exactly, so it sends a report only when one would change something:

- an asset was never published;
- the trigger-shock preview flips the stored verdict;
- the stored report is older than `refreshAfterSec`;
- Kaskad emitted a book event for the asset;
- GuardV2 or RiskVault lags the oracle.

It never sends inside the oracle's cooldown, where `publish()` would revert. The gas limit is sized to what the report runs, because Monad charges the limit.

## Contracts (Monad testnet)

| | Address |
|---|---|
| KaskadCREReceiver | `0xfdef473e3C03F42A2bC9ad5eC1e4f3b02f9c2e86` |
| Forwarder (CRE MockKeystoneForwarder, simulation) | `0xB9F79d863261869B234c481D1f9A7af84AeAd192` |
| RiskOracle / GuardV2 / RiskVault / KaskadMCv3 | `contracts/deployments/risk-testnet.json` |

`KaskadCREReceiver.setForwarder()` switches to the production KeystoneForwarder (`0xF8344CFd5c43616a4366C34E3EEE75af79a74482`) for a deployed workflow. `setExpectedOwner()` pins the workflow owner.

## Run it

Requirements: [CRE CLI](https://docs.chain.link/cre/getting-started/cli-installation) ≥ 1.30 (Monad testnet), Bun, and a CRE account (`cre login`).

```bash
cd cre/kaskad-risk && bun install && bun test          # 17 tests, SDK mocks
cd .. && cre workflow simulate kaskad-risk --target staging-settings --non-interactive --trigger-index 0
```

- **Cron trigger:** `--trigger-index 0`.
- **Book-event trigger:** `--trigger-index 1 --evm-tx-hash <Kaskad tx> --evm-event-index 0`.
- **Write the report on chain:** add `--broadcast`. Set `CRE_ETH_PRIVATE_KEY` (a funded testnet key) in `cre/.env` first; see `.env.example`.

## Run logs

`runs/` holds the logs of these simulations on Monad testnet, with the transactions they produced:

| Log | Trigger | Decision | On chain |
|---|---|---|---|
| `01-cron-stale-broadcast.log` | cron | both reports older than 6 h → publish syrupUSDC + WETH, guard, vault | [`0x0716…c5b5`](https://testnet.monadscan.com/tx/0x07161a3ab2b540af3e1177e40161027893e800a9551df37bb019f8e38f89c5b5): syrupUSDC LTV 85% → 80%, market stays paused |
| `02-book-event-cooldown.log` | Kaskad `PositionsLoaded` (syrupUSDC) | inside the oracle's cooldown → wait, no report | — |
| `03-book-event-broadcast.log` | same event, after the cooldown | publish syrupUSDC, guard, vault | [`0xd724…55db`](https://testnet.monadscan.com/tx/0xd7249a005920b4769d98789991c62857f90601dfa474a1c4d7692608716055db): syrupUSDC LTV 80% → 75% |
| `04-cron-steady.log` | cron | everything agrees with the books → no report, no gas | — |
