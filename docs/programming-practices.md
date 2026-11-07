# Corral programming practices

This is how Corral follows the payment, database, security, and job rules in
`Uzski-Corp/agent-skills` skill `programming-best-practices`. That skill is
written for Go and Rust. Corral stays FastAPI, async SQLAlchemy, Alembic,
Postgres, arq, Redis, and Next.js. Do not add a Go or Rust service, a second
queue, or a new idempotency cache to match the skill's examples.

Use the libraries already in the repo. Paddle remains the payment source of
truth. Postgres remains the local projection. arq remains the job runner.

## Payments

Write the local record before calling Paddle. A checkout row is the idempotency
record. One workspace has at most one open or ambiguous checkout.

- Reuse that checkout when the plan and interval match and a transaction id exists.
- A different open plan returns `checkout_in_progress`. An ambiguous row returns
  `checkout_unconfirmed`. Do not create another transaction.
- A timeout or HTTP 5xx on a Paddle write is ambiguous. Mark the checkout
  `ambiguous` and do not retry it. A GET may be retried once. This is stricter
  than the skill's sample, which retries 5xx charges. An unknown create can
  charge twice, so Corral does not retry it.
- The browser never sends an amount or a Paddle price id. The server maps
  `field` or `range` plus `month` to the configured price. Territory without a
  price is `contact_sales`. Reject a price that includes `trial_period`.
- `checkout.completed` in Paddle.js does not grant access. The screen shows
  "Confirming payment" until the stored subscription says paid, then stops.
- Verify `Paddle-Signature` on the raw body before parsing JSON. Compare with
  `hmac.compare_digest` only when the lengths match. Reject a timestamp older
  than 5 seconds. Any matching `h1` is enough during secret rotation.
- Store the event id before acknowledging. Process it in the worker. An older
  event must not roll subscription state backward. Equal timestamps may apply.
- Resolve the workspace from the local checkout, customer, or subscription row.
  `custom_data` is supporting metadata, not the tenant authority.
- A scheduled cancellation keeps access until `cancel_effective_at`.
  `past_due` is not paid access while `BILLING_PAST_DUE_ACCESS` is `unresolved`.
- Refunds and plan changes are not implemented. Do not invent them in the UI.

## Authorization

The organization and role come from the WorkOS session. Owner and admin can
create checkout, open the portal, and change SMS preferences. A member can read
billing status and cannot change it.

State-changing billing routes require an allow-listed `Origin`. The Paddle
webhook is public in the route table and is authenticated by the signature, not
by a browser session or an origin check.

`BILLING_ENFORCE_ACCESS` defaults to false. When it is true, new knowledge-base
file and URL adds, knowledge re-reads, and lead CSV imports that write rows
require an active local trial or paid access. Reads, billing, discovery,
sequences, knowledge search, and import dry runs stay open. Company, draft, and
mailbox allowances are displayed and are not count-enforced.

## Database

Schema changes go through Alembic. Each revision has a downgrade. Tenant tables
use `tenant_isolation` on `app.current_org`. `paddle_webhook_events` is
operational: row security denies every normal role, and only the documented
`SECURITY DEFINER` functions cross tenants.

Keep the trial start in the same transaction as onboarding completion. A second
completion, including a concurrent one, must not move `trial_started_at`. Do not
backdate a trial for a workspace that already finished onboarding.

Use parameterized SQL. Do not disable row-level security to make a webhook easier.

## Jobs

Billing projection, reconciliation, and the SMS reminder hook run on the
existing arq worker. Jobs have a timeout and `WORKER_MAX_TRIES`. A billable-work
job that loses access is deferred. It is not failed, and the accepted upload is
not deleted.

The SMS reminder job logs that no sponsor is configured. It does not send and
does not mark a message delivered.

## Configuration and logs

Keys, webhook secrets, price ids, and the enforcement switch are environment
variables. Sandbox keys stay on the sandbox API. A live key is rejected when
`PADDLE_ENVIRONMENT=sandbox`. Do not log API keys, webhook secrets, or session
cookies. Price ids are not secrets. Do not commit them as production defaults.

## What this skill does not require here

- `cmd/`, `internal/`, `go test -race`, Clippy, or a Rust rewrite.
- A generic Redis idempotency store beside `billing_checkouts`.
- Retrying an ambiguous Paddle create.
- GraphQL, a second event bus, or a hand-rolled Redis queue beside arq.
- Counting company reads, AI drafts, or mailboxes until a counter exists.

## Still open

- [ ] Run the Alembic up/down tests against Postgres. They were skipped when Docker was unavailable.
- [ ] Point a Paddle webhook destination at the deployed API only. Do not use a placeholder URL, and do not change Athena's catalog.
- [ ] Leave the shared seller's default payment link alone unless checkout settings can be read without affecting Athena.
- [ ] Add billing metrics for checkout failures, rejected signatures, and unprocessed events before enforcement is turned on.
- [ ] Choose a billing SMS sponsor before any delivery flag can succeed.
