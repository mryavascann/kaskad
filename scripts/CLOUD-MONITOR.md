# Kaskad cloud monitoring

The monitor has two execution paths that share the same checks:

- `POST /api/monitor`: a protected Vercel endpoint, intended to be called hourly
  by cron-job.org. This does not need a GitHub personal access token.
- `Kaskad cloud monitor`: the existing GitHub Actions workflow, available for
  manual checks and as a fallback. Its native hourly schedule must be verified
  from actual run history; an active workflow is not proof that it runs.

Both run in the cloud and do not require a laptop or Codex to be open. Do not
mark the Vercel path active until its production configuration, email delivery,
and **actual automatic scheduler executions** have been verified. Keep the
existing GitHub configuration until the replacement is proven. Then disable the
old workflow with operator approval to avoid two independent alert histories.

Checks stop at **2026-11-03 23:59:59 Europe/Istanbul**. Configure the external
schedule to expire then. The Vercel endpoint and CLI independently stop querying
providers at `2026-11-03T21:00:00Z`, even if a scheduler continues calling them.
The first GitHub workflow run after the cutoff also disables that workflow.

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

An unavailable reading is retried once, then reported as unknown, never as a
zero balance or a healthy service. The CLI waits 30 seconds between attempts.
The Vercel endpoint uses a 1-second retry delay, at most 4 seconds per provider
request, and a 25-second overall network deadline to fit the scheduler's
30-second timeout. Messages are in Turkish.
Successful unchanged checks are quiet. A changed incident level or recovery
sends an email; numeric drift inside the same alert band does not send another.

Only sanitized monitoring state is saved: Vercel uses the existing Redis
integration under `kaskad:monitor:vercel:v1`; GitHub uses the default branch's
Actions cache. These histories are separate. State loss can produce one
additional alert for an ongoing problem.
No email addresses, credentials or raw provider responses are stored in the
repository, state or workflow logs. Vercel refuses to run if Redis is unavailable
or its state is malformed. A shared Redis lease prevents overlapping runs and a
shared quota allows at most one accepted request per minute. A Nansen cost pause
is persisted before sending email; notification history advances only after the
mail service accepts it.

If the Vercel endpoint cannot complete (including a mail failure), it returns a
non-2xx status. Enable cron-job.org's independent failure email for this case,
including an unreachable Vercel deployment. A GitHub job failure also attempts a
short failure email. No system can guarantee delivery during a failure of its
own notification provider; inspect the scheduler, Resend, and deployment logs.

## Vercel and external scheduler setup

Use **Secret** variables, scoped to **Production** only:

- `KASKAD_MONITOR_SECRET`: a new random secret of at least 32 characters, used
  only to authorize this monitoring endpoint. Do not reuse an API or GitHub key.
- `RESEND_API_KEY`: a Sending access key for the recipient's Resend account.
- `ALERT_EMAIL_TO`: the recipient address matching that Resend account.
- `NANSEN_API_KEY`: keep the existing production value.
- Existing `KV_REST_API_URL` and `KV_REST_API_TOKEN`, or a complete
  `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` pair, supply Redis storage.

Do not use `NEXT_PUBLIC_` names. Preview deployments refuse to run the monitor.
Missing configuration fails closed. The endpoint ignores request bodies and
query parameters: a caller cannot choose a recipient, provider URL or API key.
Authorization is compared using fixed-length hashes and a timing-safe check.

Environment changes need a subsequent production deployment to take effect.
Review the code, obtain the required commit/PR/merge and deployment approvals,
and keep the dedicated monitoring secret out of chat, commands, screenshots and
repository files. Only that dedicated secret is shared with cron-job.org;
Nansen, Redis and Resend credentials remain on Vercel.

Create a cron-job.org job with these settings:

| Setting | Value |
| --- | --- |
| URL | `https://kaskad42.vercel.app/api/monitor` |
| Method | `POST` |
| Header | `Authorization: Bearer <dedicated monitoring secret>` |
| Body | Empty |
| Schedule | `37 * * * *` in `Europe/Istanbul` |
| Expiry | `2026-11-03 23:59:59` in that time zone |
| Timeout | 30 seconds |
| Save responses | Off |
| Treat redirects as success | Off |
| Notifications | First failed execution, recovery, and automatic disabling |
| Notification destination | The user's verified cron-job.org account email |

Create it disabled until the production endpoint and credentials are ready.
Do not place the secret in the URL. A 2xx response means the monitor completed;
known site/balance problems are reported through Resend. A non-2xx response means
the scheduler must send its independent failure notification. Review any
automatic disabling notice and re-enable only after resolving the failure.

Activation checklist:

1. Confirm an unauthenticated request returns 401 without triggering checks.
2. With the dedicated authorization header, make one approved setup request with
   `x-kaskad-monitor-test: true`. Confirm six checks and receipt of the test mail.
   Do not leave this test header on the recurring job.
3. Allow at least one minute between accepted requests. Temporarily use a
   5-minute schedule and observe two real automatic executions, with HTTP 200,
   in cron-job.org history. A manual Test Run is not automatic-run evidence.
4. Set the permanent hourly schedule and expiry, and verify the displayed next
   executions. Do not infer successful checks solely from a lack of email.
5. With approval, disable the old GitHub monitor workflow and keep the local
   Codex heartbeat paused. The Vercel path does not dispatch that workflow.
6. Record the actual scheduler job, automatic execution times and verification
   result in the local handoff. Never include the authorization header.

## GitHub fallback configuration

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
For this fallback path, retire the old local Codex heartbeat only after both
checks pass. When migrating to Vercel, use the activation checklist above.

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
cd web
npx vitest run
npx tsc --noEmit
npx eslint .
npm run build
```

For a new monitoring period, review the code and workflow cutoff together; do
not silently extend the deadline or enable purchases. A cached `nansenPaused`
flag must only be cleared after the free endpoint's price has been verified.

Provider setup references: [cron-job.org REST API](https://docs.cron-job.org/rest-api.html)
and [Vercel environment variables](https://vercel.com/docs/environment-variables).
