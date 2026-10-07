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
