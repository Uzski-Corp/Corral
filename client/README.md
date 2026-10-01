# Corral client (Next.js 16)

Bau's M1 design (`docs/design/HANDOFF-ENG.md`) wired to the Corral API's WorkOS AuthKit session.

## Run it

Node 22 (`.nvmrc`, `engines` in `package.json`): `nvm use` in this folder.

```bash
pnpm install
cp .env.example .env.local   # API origin only; WorkOS keys stay in server/.env
pnpm dev:review   # design review: no auth, sample person, every review state (?view=, ?step=, ?state=, …)
pnpm dev          # real auth against the API at NEXT_PUBLIC_API_URL (default http://localhost:8000)
```

For `pnpm dev`, run the API from `server/` (branch `eng-61-auth`, see `server/README.md`) with
`FRONTEND_URL=http://localhost:3000`, `CORS_ORIGINS=["http://localhost:3000"]` and WorkOS keys.
Open both on `localhost` (not `127.0.0.1`) so the API's `wos_session` cookie reaches the app.

| Variable | Default | What it does |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` outside production; **required** in production | API origin. Inlined at build time. |
| `NEXT_PUBLIC_DESIGN_REVIEW` | unset | `1` turns off auth and shows Bau's sample shell. Never set it on a real deploy. |
| `NEXT_PUBLIC_API_TIMEOUT_MS` | `10000` | Per-request deadline for API calls. |
| `SESSION_COOKIE_NAME` | `wos_session` | Must match the API's `SESSION_COOKIE_NAME`; read by `proxy.ts`. |
| `NEXT_PUBLIC_STATUS_URL` | `#status` | Status page for every "Status" link (sign-in footer, sign-in-down screen, API-down shell). http(s) URL, `/path` or `#fragment`. Inlined at build time. |

Review query params (`/sign-in?state=…`) are honoured outside production and in the review build.

## How auth works

- `lib/api/`: typed `fetch` client (cookies included, deadlines, `Result<T, ApiError>`, response decoders) and the auth contract (`/api/v1/auth/login|callback|refresh|logout|me`).
- `proxy.ts` + `lib/auth/gate.ts`: optimistic cookie check. `/app` and `/onboarding` without a session go to `/sign-in?next=…`; after the AuthKit round trip (which lands on `/`) the app continues to the saved destination, via onboarding for a browser that has not been through it.
- `components/session/SessionProvider.tsx`: confirms the session with `/me`, refreshes it every 10 minutes while visible, and signs out (`POST /logout` then the WorkOS logout URL).

## Check it

```bash
pnpm lint
pnpm typecheck          # next typegen && tsc --noEmit
pnpm test               # Vitest + Testing Library + MSW
pnpm test:coverage      # with the 90% gate on the auth/session code
pnpm build
pnpm test:e2e           # Playwright: production build + e2e/mock-api.mjs (a stand-in for the API)
```

`pnpm exec playwright install chromium` once, or `PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e` to use
the system Chrome. Visual baselines are in `e2e/__screenshots__`; refresh them with
`pnpm test:e2e --update-snapshots` after an intended design change.
