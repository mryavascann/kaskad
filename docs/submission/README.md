# Finalized Metropolis submission

[Project README](../../README.md) · [Documentation index](../README.md) · [Video archive](../video/README.md)

**Status: submitted and finalized on 13 October 2026 · Ready for judging.**

The final **Submit entry** confirmation was completed, and the read-only **Ready for judging** state persisted after reloading the portal. All **6/6 submission fields** and **8/8 award sections** were complete. The submission is closed out on the team's side; no video upload, missing field, or additional Submit action remains.

The portal's content-save timestamp is distinct from the final Submit action. This archive records completion on 13 October, without treating an earlier draft save as proof of submission or claiming an award outcome.

## Published videos

| Video | Final duration | Limit | Watch |
|---|---:|---:|---|
| Technical demo | 2:48 | 3:00 | [Published video](https://youtu.be/OZ5R2g6rRJo) |
| Pitch | 1:51 | 2:00 | [Published video](https://youtu.be/dxSGycde_b0) |
| Chainlink CRE | 1:32 | 2:00 | [Published video](https://youtu.be/BgLYiIOVSEA) |
| Perpl Risk Tool | 1:45 | 2:00 | [Published video](https://youtu.be/styCT_l5ayU) |

Durations are rounded for display; exact measured seconds and the final links are in [submission-status.json](submission-status.json). All four videos were checked for anonymous playback during final delivery, and their public YouTube metadata was rechecked on 13 October 2026. The checks sampled playback and relevant evidence sections; they are not a frame-by-frame transcript review.

## Completed delivery checklist

- [x] Project description, repository, live product, and reviewer access information supplied.
- [x] Kaskad logo uploaded and previewed.
- [x] Technical demo, pitch, CRE, and Perpl videos published and linked.
- [x] Video durations checked against the relevant 3-minute / 2-minute limits.
- [x] Eight selected award sections completed, including PRU Blockchain Community.
- [x] Final Submit entry confirmed; Ready for judging persisted after reload.
- [x] Production watchlist persistence verified after a fresh passkey sign-in.
- [x] Computer-independent cloud monitoring activated and verified with real automatic executions.

## Archive contents

| File | Purpose |
|---|---|
| [submission-status.json](submission-status.json) | Final status, verification scope, video links/durations, and follow-on engineering boundaries. |
| [panel-fields.json](panel-fields.json) | The prepared English field copy, with final media links and status metadata. This is not a byte-for-byte export of the final portal entry. |
| [Panel copy reference](../metropolis-panel.md) | Readable project, integration, and reviewer-access copy from that preparation archive. |
| [package-validation.json](package-validation.json) | Local document consistency checks; it does not independently query or certify the submission portal. |
| [PNG logo](kaskad-logo-1024.png) / [SVG source](kaskad-logo.svg) | The submitted project logo and its source. |
| [Video production archive](../video/README.md) | Original narration scripts and recording plans, retained for provenance. |

## Logo provenance

The 1024 × 1024 PNG is 31,730 bytes. Its SVG preserves the existing app's [logo geometry](../../web/design/ui/logo.tsx) and [color tokens](../../web/design/tokens.ts): two light bars, one red bar rotated 14°, and the dark background. This documentation work does not redesign the app or logo.

## Scope after submission

The submitted demo uses recorded Aave snapshots, testnet mock markets and demo kUSD, and CLI simulation evidence for CRE. Perpl reads live mainnet data. A continuous Aave keeper and deployed production CRE workflow remain future engineering work, as explained in the [technical reference](../TECHNICAL-REFERENCE.md#limits-and-roadmap). They are not pending submission fields.

The team represents **PRU Blockchain Community**. This records the selected affiliation; it does not claim a separate organizer eligibility decision or an award. The Perpl entry covers **Analytics / Risk Tool**, not a hedge bot.

Cloud health monitoring is configured through **3 November 2026** and checks the site, sponsor reserve, and Nansen credits. It does not purchase credits, transfer MON, or run the risk pipeline. See [operations](../DEVELOPMENT.md#cloud-health-monitoring) for the dated activation evidence and [the monitoring runbook](../../scripts/CLOUD-MONITOR.md) for configuration. Historical balances from preparation are not presented as current balances.
