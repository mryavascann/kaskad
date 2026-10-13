# Kaskad cloud monitoring

The `Kaskad cloud monitor` GitHub Actions workflow runs on GitHub-hosted runners,
so it does not depend on a laptop or Codex being open. It checks hourly at minute
37. GitHub may delay or drop scheduled jobs during high load: this is periodic
monitoring, not a guaranteed real-time uptime service.

Checks stop at **2026-11-03 23:59:59 Europe/Istanbul**. The first workflow run
after that time disables this workflow. The monitor itself also refuses to make
requests after the cutoff, even if disabling the workflow fails.

## Checks and alerts

- `/tr`, `/tr/app`, `/tr/cuzdan`, `/tr/perps`: HTTP 200 and a Kaskad page title.
  This does not execute transactions or test every interactive feature.
- Public `GET /api/fund`: preserve the existing 10 MON reserve and transfer gas
  buffer. Warn below 2 usable MON, escalate below 1 MON or if the smallest grant
  cannot be funded. A net decrease of at least 1 MON since the previous reading
  (at most 24 hours old) also warns. No payment or faucet request is made.
- Free Nansen `GET /api/v1/account`: warn below 100 credits, escalate at zero or
  an authorization failure. Never call `/api/labels` or paid research endpoints
  for monitoring. If the zero-credit cost is no longer confirmed, pause Nansen
  queries in saved state until an operator reviews the change.

An unavailable reading is retried once after 30 seconds, then reported as
unknown, never as a zero balance or a healthy service. Messages are in Turkish.
Successful unchanged checks are quiet. A changed incident level or recovery
sends an email; numeric drift inside the same alert band does not send another.

Only sanitized monitoring state is saved in the default branch's Actions cache.
If the cache is evicted, an ongoing problem can produce one additional alert.
No email addresses, credentials or raw provider responses are stored in the
repository, cache or workflow logs. A failed run also attempts a short failure
email. If the mail provider itself fails, delivery cannot be guaranteed: inspect
the failed workflow run and mail dashboard.

## Configuration

Repository Actions secrets:

- `NANSEN_API_KEY`: the account key used by the deployed Kaskad application.
- `RESEND_API_KEY`: email sending key from the recipient's Resend account.
- `ALERT_EMAIL_TO`: one recipient email address, matching that Resend account.

The sender is `Kaskad <onboarding@resend.dev>`. This Resend testing sender only
supports the account owner's address. Other recipients require a verified
sender domain and a reviewed sender change. Do not enable paid top-ups.

The monitor runs only on `main`, on a schedule or manual dispatch. It never runs
with these secrets on pull-request events. The expiry job has `actions: write`
solely to disable its own workflow; the checking job only needs `contents: read`.

After merge, manually run the workflow with `send_test=true`. Confirm the run
passes and the email arrives (including checking the spam folder). This verifies
the checks and email route, but does **not** verify the automatic schedule.
Before marking hourly monitoring verified, also observe a successful run with
event `schedule` on a GitHub-hosted runner. Inspect subsequent scheduled runs to
confirm continued operation; an `active` workflow alone is not evidence of this.
Retire the old local Codex heartbeat only after both checks pass.

Read the automatic run history without starting a manual check:

```sh
gh run list --repo mryavascann/kaskad --workflow cloud-monitor.yml --event schedule --limit 5
```

If no scheduled runs appear across multiple hourly windows, keep the monitoring
setup marked unverified. Check the default branch, workflow state and GitHub
Actions status. A fresh cron change can re-register a schedule, but is a repair
attempt, not proof of recovery. If it remains silent, escalate to the repository
owner or GitHub Support. A workflow that never starts cannot send its own failure
email; do not infer health from the absence of alert emails.

Local read-only validation (no email and no state write):

```sh
node --env-file=web/.env.local scripts/node_modules/tsx/dist/cli.mjs scripts/src/monitor.ts --dry-run
npm --prefix scripts test
npm --prefix scripts run typecheck
```

For a new monitoring period, review the code and workflow cutoff together; do
not silently extend the deadline or enable purchases. A cached `nansenPaused`
flag must only be cleared after the free endpoint's price has been verified.
