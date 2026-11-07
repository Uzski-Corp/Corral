# Corral demo handoff

## Public domain and deployment boundary

`https://corral.uzskicorp.agency` exists and served HTTP 200 on 7 November 2026.
It is the Cloudflare static marketing deployment documented in
`hosting/landing/README.md`. Its `/api/v1/billing` path returned an HTML 404.
A public website is not yet a deployed FastAPI webhook origin.

The new `/pay` page is included in the static site's assembly list. Once built,
published, and approved as a checkout website in Paddle, set:

```ini
PADDLE_CHECKOUT_URL=https://corral.uzskicorp.agency/pay
```

This is a per-transaction override and does not change Athena's seller-wide
payment link. Paddle still requires a seller default payment link to exist.
The marketing build needs the matching public Paddle client token/environment.
The full authenticated app must be deployed separately before the payment page's
Return to billing link is useful on that origin. Do not publish the page with a
production token while the backend creates sandbox transactions.

The provider webhook URLs belong on the actual deployed API origin:

- `POST /api/v1/billing/webhooks/paddle`
- `POST /api/v1/inbox/webhooks/autosend`

Coolify deployment is now complete; see the deployment result below. No payment, email, or SMS was sent.

## Implemented source

- Durable AutoSend demo outbox, one configured workspace and explicit recipient
  allowlist. Send intent commits before a network call. Cron drains Postgres every
  ten seconds; Redis job admission is not the only record of work.
- Real new-message composer and reply submission in Unibox. Provider acceptance,
  sent, delivered, failed, bounced, and uncertain states are distinguished.
- Raw-body HMAC-verified AutoSend events, payload-based deduplication, inbound body
  retrieval, trusted message-reference/thread mapping, and sender/recipient checks.
  Unmatched events remain retained for reconciliation; no guessing by subject.
- Only definite submission failures can be retried from the UI. Unknown outcomes
  require checking AutoSend; they cannot silently trigger duplicate delivery.
- Private Pi service with pinned 1.4.0 packages, Linux file ownership lock, one local
  SQLite per run, bounded model/tool turns, and persisted budget counts.
- Postgres AI run admission and status. Short arq submit/reconcile cycles, scoped
  read-thread/knowledge tools, cancellation, deadline, and evidence validation.
- AI results remain separate suggestions. Existing text is replaced only after an
  explicit Use suggestion action and confirmation when text exists. Changed threads
  are flagged. Draft text and active run IDs survive a browser refresh locally.
- Billing fixes: persist ambiguous checkout intent before external submission,
  prevent another subscription checkout, verify mapped price amount/currency,
  reject future-dated signatures, preserve requeue work across access deferral,
  lock billing projections, and provide payment-page override and refresh recovery.

## Setup when credentials are ready

1. Copy the existing env examples, filling in WorkOS and DB/Redis settings as well
   as Paddle configuration. Keep `BILLING_ENFORCE_ACCESS=false` for the demo until
   the existing-workspace rollout and payment-failure policy are decided.
2. Configure AutoSend with a project API key, verified sending domain, inbound
   receiving address/domain, and webhook secret. Prefer a separate demo project.
   Set these on **both** API and worker through `server/.env`:

```ini
AUTOSEND_API_KEY=<server secret>
AUTOSEND_WEBHOOK_SECRET=<webhook signing secret>
AUTOSEND_DEMO_ORG_ID=<local Corral organization UUID>
AUTOSEND_DEMO_FROM=<verified sender address>
AUTOSEND_DEMO_REPLY_TO=<AutoSend inbound receiving address>
AUTOSEND_DEMO_RECIPIENTS=["<your consenting demo recipient>"]
```

3. Subscribe the AutoSend webhook to `email.received`, `email.sent`,
   `email.delivered`, and `email.bounced`. Webhooks/inbound need to be available on
   the account. The inbound address must receive the recipient's reply; a normal
   email address without inbound configuration will not populate Unibox.
4. Copy `services/pi-intelligence/.env.example` to `.env`. Use the same random
   `PI_SERVICE_TOKEN` of at least 32 characters in that file and `server/.env`.
   Set the model provider key only in the Pi service env. `PI_MODEL` must exist in
   the pinned Pi model catalog. The default is `gpt-5-mini`; catalog compatibility
   remains unverified until dependency installation.
5. Pi dependencies now have a committed lockfile. For a fresh checkout:

```sh
cd services/pi-intelligence
npm ci --ignore-scripts
npm run check
```

6. Start the stack from the repository root:

```sh
docker compose -f docker-compose.yml -f docker-compose.demo.yml up --build
```

The existing API container startup runs migrations; inspect its startup output.
Migrations `0010_billing`, `0011_demo_mail`, and `0012_ai_runs` must all be applied
before using the changed routes. For non-container startup, run Alembic explicitly.
The live Coolify deployment applied all migrations through `0012_ai_runs`.

Pi has no public port in Compose. Give its data volume one owner and a local disk;
do not share SQLite files between replicas or over network storage. Node 24+ and
Linux `/usr/bin/flock` are required. The Dockerfile installs these dependencies.
The Pi Dockerfile uses `npm ci` with the committed lockfile.

## Sean's manual demo exercise

1. Sign in, complete onboarding, and open Settings → Billing. Confirm the trial
   dates survive repeat onboarding and refresh. Try sandbox checkout and verify
   that paid access comes from the API/webhook, not the browser callback.
2. Add a product and a small knowledge document; wait for ingestion to finish.
3. Open Unibox → New demo message. Pick an allowlisted recipient and send a short
   message. Observe queued → accepted → provider delivery events.
4. Reply from the recipient mailbox. The reply should appear in the same thread.
5. Select the product and Generate reply. Inspect the suggestion and knowledge
   passages. Type your own text while generation runs; it must remain untouched.
6. Use the suggestion, edit it, send, and check the recipient's actual inbox.
7. Exercise cancellation, duplicate send clicks, API/network interruption, missing
   credentials, a non-allowlisted recipient, and an inbound reply arriving during
   generation. Uncertain deliveries must not auto-resend.

## Validation and known limits

No tests or autonomous UI QA were run during this takeover. Frontend typechecking
and scoped Python lint/typechecking are static checks only. Live database migration startup is verified. Provider
integration remains unverified. Pi dependencies are installed and its TypeScript check passed.
The sandbox also denied starting the local Next preview (`listen EPERM`).
Automatic approval review could not approve Pi dependency installation because its
usage quota was exhausted. Branch creation was denied by filesystem permissions,
so these changes remain uncommitted in the existing checkout; no PR was opened.

This is one consent-only demo workspace, not customer mailbox infrastructure.
No Google/Microsoft OAuth, mailbox synchronization, rotation, production cold
outreach, SMS sending, automated discovery/scoring, or plan-count enforcement is
claimed. The AI integration checks billing access but only records token usage;
it does not yet reserve or settle billable usage credits. Its internal hard turn
limits and deadline protect each run, not a monthly workspace spend budget.

Attachments/HTML-only replies are not rendered; a plain-text fallback points to
AutoSend. Draft persistence is browser-local, not synchronized across devices.
Unmatched inbound events and ambiguous sends require operator review in this
slice. Pi result/evidence data and provider receipts need a retention/backup policy
before production use.

## Provider references

- [Paddle payment-page override](https://developer.paddle.com/build/transactions/default-payment-link/)
- [AutoSend send schema](https://docs.autosend.com/api-reference/mails/send)
- [AutoSend inbound message schema](https://docs.autosend.com/api-reference/inbound-emails/get-message)
- [AutoSend webhook signatures](https://docs.autosend.com/others/webhooks/verify-requests)
- [AutoSend event types](https://docs.autosend.com/others/webhooks/event-type)

## Coolify deployment (7 November 2026)

Project: Corral. Application UUID: `uwpxnpwz0i9twspfgszajrg5`.
Git source: `Uzski-Corp/Corral`, branch `codex/corral-demo-live`.
Compose file: `docker-compose.coolify.yml`. Manual deployments are enabled;
auto-deploy is disabled. Database, Redis, and the worker have no published host ports.
Postgres data persists independently of container rebuilds.

Pi is the Rumpty durable service, not a Compose service. Coolify `PI_SERVICE_URL`
is `https://nice-bobcat-63873b.rumptycloud.app` (`/healthz` returns `{"status":"ok"}`).
The API and worker call that origin with `PI_SERVICE_TOKEN`. Pi itself must use the
same token and `CORRAL_INTERNAL_URL=https://api.corral.uzskicorp.agency`.

App: `https://app.corral.uzskicorp.agency`.
API: `https://api.corral.uzskicorp.agency`.
Both DNS-only A records must point to `204.168.155.177`.
WorkOS must allow the deployed callback:
`https://api.corral.uzskicorp.agency/api/v1/auth/callback`,
and frontend origin `https://app.corral.uzskicorp.agency`.
Credentials belong in Coolify's application environment. The local demo mailbox
values were placeholders; replace them with actual verified addresses and the
organization UUID created after signing into the deployed app. Configure the
AutoSend webhook after the API is reachable. Add `OPENAI_API_KEY` in Coolify
before generating replies. Keep Paddle sandbox until payment setup is complete.

The Pi lockfile is now committed and `npm run check` completed successfully.
No automated tests or UI QA have been executed.

### Deployment result

Coolify deployment `7tqorlh40iqyuapgpx8qcis2` finished successfully at commit
`01e6ce9` on 7 November 2026. Public API `/readyz` returned database/Redis OK
with valid TLS, and the dashboard root returned HTTP 200. All migrations through
`0012_ai_runs` applied during actual startup. This is deployment verification,
not an automated test-suite result or UI acceptance test.

The billing migration now executes each SQL function as its own asyncpg command
and casts UUIDs to text for its singleton aggregate on PostgreSQL 16.
Pi dependencies are installed, pinned and typechecked. First build memory pressure
was resolved by stopping Akiwah/CampoSocial staging (including databases, with
volumes preserved), serializing Compose builds and limiting dashboard build heap.

AutoSend verified sender/inbound address, recipient allowlist, real organization
UUID and webhook signing secret remain unset. OPENAI_API_KEY and Paddle keys
still need to be entered in Coolify. WorkOS URLs and DNS records were configured
by Sean. Trial/login/UI acceptance remains Sean's manual exercise.
