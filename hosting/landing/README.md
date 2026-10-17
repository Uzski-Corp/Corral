# corral-landing

The marketing site at https://corral.uzskicorp.agency, served by the Cloudflare Worker `corral-landing`
(account `6eb9d92e84a9ebc29025971e4cef544e`).

The site is the client's static `next build` output. `assemble.mjs` copies the prerendered pages, `public/`
and `.next/static` from `client/` into `dist/`, and `src/index.ts` serves `dist/` through the `ASSETS` binding
(plus a `/_next/image` passthrough, since the static build has no image optimizer).

```sh
cd client && pnpm build            # NEXT_PUBLIC_SITE_URL overrides the default origin
cd ../hosting/landing && pnpm install
pnpm deploy                        # node assemble.mjs && cf deploy (reads cloudflare.config.ts)
```

A new page only ships once it is in the `pages` list in `assemble.mjs`.
`dist/`, `.cloudflare/`, `.wrangler/` and `node_modules/` are build output and are never committed.

## Waitlist (`POST /api/waitlist`)

`src/waitlist.ts` answers the landing pages' waitlist form (contract: `client/lib/marketing/waitlist.ts`). Signups go
to the D1 database `corral-waitlist` (binding `WAITLIST_DB`, id `217835f7-3973-4120-bde4-5a7d2268c917`).

- JSON `{ email, source }`: `201 {status:"joined"}`, `200 {status:"exists"}`, `422 {error:"invalid_email"}`.
  Errors: 400 bad body, 403 cross-origin, 405 not POST, 413 over 2 KB, 415 other content types, 429 rate-limited, 500.
- Form post (JS off): `303` back to the Referer path (same origin, else `/`) with `#waitlist-joined|exists|invalid|error`.
- Emails are trimmed and lowercased; unknown sources are stored as `unknown`; the country comes from `request.cf`.
- The IP is stored only as a SHA-256 hash (salted with the optional `IP_HASH_SALT` secret), used for the rate limit:
  at most 5 new addresses per IP per 10 minutes. No email is sent.

```sh
pnpm test                 # vitest, D1 faked with node:sqlite running the real migrations
pnpm test:coverage        # 100% thresholds
pnpm typecheck
pnpm run db:migrate:remote  # apply migrations/ to the production database
wrangler d1 execute corral-waitlist --remote --command "SELECT source, COUNT(*) FROM waitlist GROUP BY source"
```

## Pricing intent (`POST /api/pricing-intent`)

Behind the pricing gate the site shows no pricing; a visitor fills a short form and the pricing is emailed to them. Off by default on both sides: the Worker var `PRICING_INTENT_ENABLED` (`"0"` in wrangler.jsonc, the route answers 404) and the client build flag `NEXT_PUBLIC_PRICING_GATE=1`. Turn the Worker on only once the config below is real.

**Request:** JSON `{ fullName, industry, otherText?, email, phone?, source, website }`. `industry` is a slug from `src/pricing-validate.ts` (`other` needs `otherText`), `phone` is E.164 (`+254712345678`, spaces and dashes are stripped, `00` becomes `+`), `website` is a honeypot that must stay empty.

**Answers:** `202 {"status":"queued"}` for every accepted request, including a repeat email and a filled honeypot (nothing about who is already on file leaks); `422 {"error":"invalid_field","field"}`; `429` with `Retry-After`; `403` cross-origin, `404` flag off, `405`, `413` over 4 KB, `415` not JSON, `400` bad JSON.

**Order:** method, flag, origin, content type, size, JSON, honeypot, Turnstile (only when `TURNSTILE_SECRET` is set), validation, 5 per IP per 10 minutes, 3 per email per hour, insert into `pricing_intents` (append-only; `migrations/0002`), then `ctx.waitUntil` sends the AutoSend template and stamps `emailed_at`. Personal mail domains are stored with `free_mail = 1` and still sent to.

**Config (all placeholders until confirmed):** `src/pricing-config.ts` holds the plan rows, note, booking link, postal address and sender. While `rows` is empty nothing is sent and an `ALERT` is logged, on purpose. Template variables: `first_name`, `pricing_html` (use `{{{ }}}`), `pricing_text`, `pricing_note`, `booking_url`, `waitlist_url`, `site_host`, `unsubscribe_url`, `privacy_url`, `company_address`, `logo_url`. Template id is `PRICING_TEMPLATE_ID`; secrets are `AUTOSEND_API_KEY`, `IP_HASH_SALT`, and optionally `TURNSTILE_SECRET`.

**Run it locally:** `npx wrangler d1 migrations apply corral-waitlist --local --persist-to /tmp/wr` then `npx wrangler dev --local --persist-to /tmp/wr --var PRICING_INTENT_ENABLED:1`. Without `AUTOSEND_API_KEY` no mail is sent. Never run `db:migrate:remote` from a branch; migrations are applied at rollout.
