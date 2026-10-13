# Development and operations

[Project overview](../README.md) · [Technical reference](TECHNICAL-REFERENCE.md) · [Finalized submission](submission/README.md)

**Submission status: submitted and finalized on 13 October 2026; Ready for judging.** The instructions below support local development and continued demo operation. They are not outstanding submission tasks. Run shell commands from the repository root unless a command explicitly changes directories.

[Run locally](#run-locally) · [Data preparation](#data-preparation) · [CRE simulation](#cre-simulation) · [Validation](#validation) · [API protection](#api-and-sponsor-protection) · [Budget](#sponsor-budget-planning) · [Cloud monitoring](#cloud-health-monitoring)

## Run locally

Use **Node.js 24** for the web app and data scripts. Contract development also needs **Foundry**; CRE development needs **Bun** and the [CRE CLI](../cre/README.md#run-it). The web app uses Next.js 16; follow [`web/AGENTS.md`](../web/AGENTS.md) and the installed version's documentation when changing it.

```bash
git clone --recurse-submodules https://github.com/mryavascann/kaskad.git
cd kaskad
npm --prefix web ci
```

Create `web/.env.local` with your own server-side configuration. Never commit credentials or put private keys or authenticated RPC URLs in `NEXT_PUBLIC_*` variables.

| Variable | Used for |
|---|---|
| `MONAD_TESTNET_RPC` | Testnet RPC proxy and gas sponsorship. The deployed project uses Alchemy. |
| `MONAD_MAINNET_RPC` | Aave address lookups and Perpl mainnet reads. |
| `SPONSOR_PRIVATE_KEY` | Optional for read-only exploration; a funded testnet sponsor is needed for gas top-ups when signing. This is separate from the user's passkey key. |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | Shared RPC/sponsor protection, persistent watchlists, label caching, and monitoring state. Required in production; use a writable Upstash REST token with Lua/SET access. The complete `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` pair is also supported. |
| `NANSEN_API_KEY` | Optional borrower labels. Uncached lookups require available API credits. |

```bash
npm --prefix web run dev
```

Open [localhost:3000](http://localhost:3000). Restart after changing environment variables. The existing testnet contracts already contain books; starting the app does not require fetching or loading them again. Some server-rendered previews default to public testnet RPC; browser reads use `/api/rpc`.

Without KV, development watchlists use process memory. Production requires writable KV for shared protection and persistence; RPC/sponsor protection returns **503** when the store is unconfigured or unavailable. Keep `NEXT_PUBLIC_DEV_SIGNERS` unset in production; `NEXT_PUBLIC_DEV_SIGNERS=1` exposes development signers.

### Data preparation

Data scripts read **repo-root `.env`**, separately from `web/.env.local`. `MONAD_MAINNET_RPC` selects a provider; the scripts can fall back to the public Monad RPC. With `ENVIO_API_TOKEN`, borrower discovery uses HyperSync. Without it, `fetch` uses the resumable RPC path; `--rpc` forces that path even when an obsolete token is configured.

```bash
npm --prefix scripts ci
npm --prefix scripts run fetch
npm --prefix scripts run depth
# Discover borrowers only, without replacing position data:
npm --prefix scripts run fetch -- --rpc --borrowers-only
```

These commands read providers and update local dataset files. They do not reload testnet books.

<details>
<summary>RPC fallback: checkpoints and historical state</summary>

Discovery validates the shipped snapshot's complete active-debt seed against reserve debt, then scans every subsequent finalized block for Aave Borrow events. The candidate set is the seed's active borrowers plus later borrowers, not an all-time borrower count. Invalid logs and failed pages are never skipped.

Validated pages are saved atomically to ignored `scripts/.local/monad-borrowers-rpc.json`, with an exclusive lock. A run processes at most 200 successful pages by default and exits nonzero if catch-up is incomplete, preserving the checkpoint and existing position data. Rerun to resume, or choose `--rpc-pages=2000` (maximum 20000). Ranges start at 1000 blocks and shrink on provider rejection.

`--borrowers-only` stops after discovery. A full refresh reads positions at the same finalized target block; providers without that historical state fail rather than silently substitute another block. Public providers impose [RPC limits](https://docs.monad.xyz/reference/json-rpc/overview), so initial catch-up can take time. This fallback is not a continuous Envio HyperIndex deployment or keeper.

</details>

To rebuild the historical replay, run these in order:

```bash
npm --prefix scripts run replay:events
npm --prefix scripts run replay:book
npm --prefix scripts run replay:trough
npm --prefix scripts run replay:compare
```

### CRE simulation

After installing the CLI, signing in with `cre login`, and following the [CRE setup guide](../cre/README.md):

```bash
(cd cre/kaskad-risk && bun install --frozen-lockfile)
(cd cre && cre workflow simulate kaskad-risk --target staging-settings --non-interactive --trigger-index 0)
```

This command omits `--broadcast`. Loading books, deploying contracts, running transaction benchmarks, or adding `--broadcast` **writes to Monad testnet and spends MON**. Review the destination, estimated cost, and signer before those separate actions. The loader uses `MONAD_TESTNET_RPC` and `DEPLOYER_PRIVATE_KEY` in repo-root `.env`; CRE broadcasting uses `CRE_ETH_PRIVATE_KEY` in `cre/.env`.

### Validation

After installing web, scripts, and CRE dependencies, run from the repository root:

```bash
(cd web && npx tsc --noEmit)
(cd web && npx eslint .)
(cd web && npx vitest run)
(cd contracts && forge fmt --check)
(cd contracts && forge test --no-match-contract 'GasBench|Profile')
(cd scripts && npx tsc --noEmit)
(cd scripts && npm test)
(cd cre/kaskad-risk && bun test)
(cd cre/kaskad-risk && bunx tsc --noEmit)
(cd cre/kaskad-risk && bun x cre-compile main.ts dist/workflow.wasm)
```

[CI](../.github/workflows/ci.yml) runs web tests/typecheck/lint, contract formatting and functional tests, script tests/typechecking, and CRE tests/typecheck/WASM compilation. Coverage includes cascade invariants, replay consistency, hidden bad debt, risk controls, CRE decisions, passkeys/watchlists, Perpl models, API protection, and monitoring.

CI also runs the quota/lease Lua against disposable Redis. To exercise that integration locally, run `KASKAD_REDIS_BIN=/path/to/redis/bin npx vitest run lib/server/protection.redis.test.ts` from `web/` with Redis binaries installed.

The diagnostic `GasBench` and `Profile` suites are excluded from normal CI because their large synthetic setup exceeds the configured local gas budget. Run all contract suites with `(cd contracts && forge test --gas-limit 1000000000)`. That higher harness limit is not evidence that a workload fits a Monad transaction; use the recorded testnet proofs for that claim.


## Operations

### API and sponsor protection

`/api/rpc` and `/api/fund` use shared Redis quotas and an expiring owner-token lock around sponsor balance/nonce checks and broadcasts. Production fails closed when the store is unavailable. Key controls:

| Control | Enforced boundary |
|---|---|
| RPC volume | 60 HTTP requests and 180 JSON-RPC items/IP/10-second window; at most 10 items/batch and 256 KiB/body. |
| RPC calls | Allowlisted deployed addresses and ABI functions; at most 30M gas. Every inner Multicall3 call is validated, with at most 128 calls and no nested multicalls or state overrides. |
| Relayed transactions | Signed EIP-1559, chain 10143, zero MON value, and permitted public app actions. No contract creation, administrative calls, token transfers, legacy transactions, or EIP-7702 delegations. |
| Sponsor requests | 8 POST requests/IP/10 minutes; 2 KiB/body. Public status GETs: 20/IP/10 seconds. |
| Sponsor spending | At most 1 MON/payment, 5 grant attempts/recipient/10 minutes, and 20 attempts/sponsor/24-hour window. A window starts with its first counted attempt. |
| Reserve | Preserve 10 MON plus maximum transfer gas; recipient target at most 4.5 MON. The client confirms each installment. |

Use a dedicated sponsor and the **same Redis database across all deployments sharing it**, including previews. Quotas are reserved before signing and not refunded after failure or an uncertain result; an uncertain broadcast retains the remaining 120-second lock, and a pending nonce blocks further payments. Twenty grants cap transfers at 20 MON plus at most 0.063 MON gas per counter window.

Sponsorship remains a public testnet faucet with spending caps. Granted native MON cannot be restricted to Kaskad actions. Other routes, including Perpl, wallet lookup, position lookup, and watchlist, still have per-instance rate limits. On hosts other than Vercel, the proxy must strip untrusted forwarding headers before supplying client IPs.

Implementation: [RPC policy](../web/lib/server/rpc-policy.ts), [shared protection](../web/lib/server/protection.ts), [fund route](../web/app/api/fund/route.ts). Configure writable KV in both Preview and Production. A read-only deployment check can confirm chain ID `0x279f`, reject a foreign-target call or 11-item batch, and read `GET /api/fund`; an actual grant is a separate transaction.

### Sponsor budget planning

With web and scripts dependencies installed, the budget CLI needs no signing key or environment file:

```bash
npm --prefix scripts run budget
npm --prefix scripts run budget -- --daily-mon 0.5 --until 2026-11-03
npm --prefix scripts run budget -- --json --check
```

It reads only public `GET /api/fund`, preserves the reserve and transfer gas buffer, and reports grant capacity, planned top-up needs, and affordable daily spending. The default **1 MON/day is a planning assumption**, not measured usage. The default horizon includes all of 3 November 2026 in Istanbul; future deposits are not assumed. `--check` exits 2 when the plan needs funds, 1 on error, and 0 otherwise.

Public balance snapshots are saved under ignored `scripts/.local/sponsor-budget.json`. Matching samples 24 hours to seven days apart show net balance change; deposits can mask spending, so this is not gross spend or a runway forecast. Use `--help` for site/history options. The CLI does not install a schedule, send alerts, change grant limits, or transfer funds; deployed health monitoring is configured separately below.

### Cloud health monitoring

**Deployment status, 13 October 2026:** cron-job.org calls the protected Vercel `POST /api/monitor` endpoint. Two real automatic executions succeeded during a five-minute verification interval; the job was then configured for **minute 37 of every hour, Europe/Istanbul**, with expiry at the end of **3 November 2026**. This runs independently of the team's computers. The previous GitHub monitor was disabled after the replacement was verified.

| Check | Alert behavior |
|---|---|
| Site | Check HTTP 200 and the Kaskad title on four deployed pages; this is availability monitoring, not a full interactive test. |
| Sponsor | Warn below 2 usable MON, escalate below 1 MON or when the smallest grant cannot be funded; also warn on a net drop of at least 1 MON between readings no more than 24 hours apart. |
| Nansen | Read the free account endpoint; warn below 100 credits and escalate at zero or an authorization failure. Pause provider queries if zero-cost status cannot be confirmed. |

Changed incidents and recoveries send email through Resend; unchanged healthy checks stay quiet. cron-job.org separately reports execution failures, recovery, and automatic disabling. The monitor does not top up balances, make paid label queries, reload Aave books, or broadcast transactions.

The endpoint requires a dedicated authorization secret, production-only configuration, and shared Redis state/locking. Only that dedicated secret is shared with the scheduler; provider credentials remain on Vercel. The endpoint also stops provider checks at **4 November 2026, 00:00 Istanbul**.

For `KASKAD_MONITOR_SECRET`, `RESEND_API_KEY`, `ALERT_EMAIL_TO`, activation checks, failure handling, and the inactive GitHub fallback, see the [cloud monitoring runbook](../scripts/CLOUD-MONITOR.md). A new monitoring period requires an explicit cutoff review; it does not extend automatically.
