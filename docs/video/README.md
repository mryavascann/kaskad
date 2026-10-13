# Final videos and production archive

[Project README](../../README.md) · [Finalized submission](../submission/README.md)

**Submitted and finalized on 13 October 2026 · Ready for judging.** All four videos were recorded, published, and included in the completed Metropolis entry. No recording, upload, or Submit task remains.

## Watch the final edits

| Video | Final duration | Limit | Watch |
|---|---:|---:|---|
| Technical demo | 2:48 | 3:00 | [Published video](https://youtu.be/OZ5R2g6rRJo) |
| Pitch | 1:51 | 2:00 | [Published video](https://youtu.be/dxSGycde_b0) |
| Chainlink CRE | 1:32 | 2:00 | [Published video](https://youtu.be/BgLYiIOVSEA) |
| Perpl Risk Tool | 1:45 | 2:00 | [Published video](https://youtu.be/styCT_l5ayU) |

Final runtimes were measured from the published players during delivery checks. Public YouTube metadata was rechecked on 13 October 2026. Exact durations and verification scope are in [submission-status.json](../submission/submission-status.json).

## Original production sources

The English narration and Turkish storyboard notes below are preserved as the production archive. Planned scene times and wording can differ from the final edits; these files are not certified transcripts. The `.txt` files intentionally contain only narration. Instructions in storyboards describe the original recording process, not outstanding work.

| Video | Storyboard / planned length | Original narration | Final length |
|---|---|---|---:|
| Technical demo | [9 scenes / 2:55](technical-demo.md) | [technical-voiceover.txt](technical-voiceover.txt) | 2:48 |
| Pitch | [6 scenes / 1:50](pitch.md) | [pitch-voiceover.txt](pitch-voiceover.txt) | 1:51 |
| Chainlink CRE | [5 scenes / 1:45](cre-demo.md) | [cre-voiceover.txt](cre-voiceover.txt) | 1:32 |
| Perpl Risk Tool | [7 scenes / 1:55](perpl-demo.md) | [perpl-voiceover.txt](perpl-voiceover.txt) | 1:45 |

[Buğra's completed handoff](BUGRA-START-HERE.md) now points to the delivered assets rather than a recording checklist.

## Evidence boundaries retained in the videos and source notes

- Aave books are recorded snapshots; the cascade runs on Monad testnet. The $111M stuck result is not a current loss.
- The −10% scenario's $8.8M hidden shortfall uses simulated pool valuation. The debt measures are not additive.
- Guard and vault actions use mock markets and demo kUSD. CRE CLI simulation and historical broadcast evidence do not establish continuous production CRE operation.
- Perpl reads live mainnet state. Wallet shocks measure notional crossing thresholds, not realized losses or allocated backstop capacity.
- Nansen uses standard labels; unlabelled addresses remain unidentified. New lookups require credits.
- Watchlist storage is encrypted, while an explicit address-risk lookup sends that address to the position API. Save → 7% threshold → reload → fresh passkey sign-in was verified in production.
- The 10,000-position benchmark is the Blitz baseline; engine gas and receipt gas differ. Historical replay uses an explicitly later liquidity assumption.

## Delivery closed

- [x] Four final videos published and their duration limits checked.
- [x] Anonymous playback and relevant evidence sections sampled during delivery.
- [x] All required entry sections completed and final Submit confirmed.
- [x] Ready for judging persisted after reloading the portal.
- [x] Documentation now links the completed media and preserves source provenance.

Cloud monitoring and future engineering are documented separately in [operations](../DEVELOPMENT.md#cloud-health-monitoring) and the [roadmap](../TECHNICAL-REFERENCE.md#limits-and-roadmap).
