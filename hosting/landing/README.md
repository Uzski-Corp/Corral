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
  at most 5 new addresses per IP per 10 minutes.
- A new address (never a repeat) gets one "You're on the list" email through AutoSend (`src/confirm.ts`), from
  `Corral <hello@uzskicorp.agency>` with replies to `corral@uzskicorp.agency`, sent after the response
  (`ctx.waitUntil`). It needs the secret `AUTOSEND_API_KEY` (an API key from the AutoSend project "Uzski Corp Mail"):
  `pnpm exec wrangler secret put AUTOSEND_API_KEY`. Without it, signups still work and no email goes out.

```sh
pnpm test                 # vitest, D1 faked with node:sqlite running the real migrations
pnpm test:coverage        # 100% thresholds
pnpm typecheck
pnpm run db:migrate:remote  # apply migrations/ to the production database
wrangler d1 execute corral-waitlist --remote --command "SELECT source, COUNT(*) FROM waitlist GROUP BY source"
```
