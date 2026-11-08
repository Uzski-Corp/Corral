# Corral client

The Next.js application contains the public marketing pages and Corral's signed-in workspace. It uses Next.js 16.3.6, React 19.2.8, TypeScript, Tailwind CSS 4, custom components/CSS, Phosphor icons, React context/hooks, and typed `fetch` clients.

See the [repository README](../README.md) for the API, worker, Pi service, hosting paths, and unfinished integration boundaries.

## Run locally

Use Node **22.x** (`.nvmrc`, `engines`) and pnpm **12.6.0** (`packageManager`). Installs reject unsupported Node versions. From `client/`:

```sh
nvm use
pnpm install --frozen-lockfile
cp .env.example .env.local  # only if this file does not already exist
pnpm dev:review
```

Open [localhost:3000/app](http://localhost:3000/app). Review mode bypasses auth and shows sample data without an API. Query parameters such as `?state=` expose design states outside production and in review builds. Never enable `NEXT_PUBLIC_DESIGN_REVIEW` on a real deployment.

For real data, run `pnpm dev` instead. It sets `CORRAL_APP=1` locally and uses `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`). Start the backend using [server instructions](../server/README.md) or root Compose. WorkOS and matching frontend/CORS settings are required for sign-in. New accounts start empty; sample data is not automatically seeded.

Use `localhost` on both sides rather than mixing it with `127.0.0.1`, so cookies reach the app. If Docker's frontend is already on 3000, stop it with `docker compose stop web` from the repo root. Dev scripts bind 3000 explicitly and fail when it is occupied.

## Code organization

| Location | Responsibility |
| --- | --- |
| `app/` | Root layout/fonts, public pages, metadata, route composition. |
| `app/app/` | Unibox, companies, contacts, segments, products, knowledge, discovery, sequences, SMS, and settings routes. |
| `app/sign-in/`, `app/onboarding/` | WorkOS sign-in and persisted workspace setup. |
| `app/styleguide/`, `app/v/`, `app/fenceline/` | Component reference and design-review surfaces; app gating controls access. |
| `components/app/` | Shared shell/primitives and feature screens. `AppDemo.tsx` composes live and review modes; its name does not mean the whole app is mocked. |
| `components/session/` | Session confirmation, live data context, account state, API-backed onboarding. |
| `lib/api/` | Typed endpoint clients, response decoders, deadlines, and `Result<T, ApiError>`. |
| `lib/auth/`, `proxy.ts` | Route gating and safe return paths. |
| `app/globals.css`, `components/app/**/*.css` | Shared Tailwind tokens and app styles; marketing themes use scoped classes. |
| `app/fonts/` | Font assets, upstream sources, and licenses. |
| `docs/design/HANDOFF-ENG.md` | Detailed design history; milestone claims are not live-provider verification. |

`AppDataProvider` supplies API clients to live views; review mode uses fixtures. App routes are separate Next pages inside the session layout. Knowledge, companies/leads, discovery, sequences, products, and settings load on demand with a skeleton; Unibox stays eager as the default screen. Avoid importing the entire app barrel for small production components.

## Auth and configuration

Proxy checks cookie presence and redirects protected routes. The API validates the session on requests. `SessionProvider` confirms the user through `/me`, refreshes while visible, and handles sign-out/recovery. Onboarding writes workspace/product state through the API and reads it back on later visits.

| Variable | Default / purpose |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` in development; required in production. Origin only, compiled into browser code. |
| `CORRAL_APP` | Unset in production; `1` in `pnpm dev`. Enables app/sign-in/onboarding/review routes; otherwise only the public allowlist opens. Server-side flag. |
| `NEXT_PUBLIC_DESIGN_REVIEW` | Unset; `1` or `true` bypasses auth and shows fixtures. |
| `NEXT_PUBLIC_API_TIMEOUT_MS` | `10000`, per-request deadline. |
| `SESSION_COOKIE_NAME` | `wos_session`; must match the API. Coolify config uses `corral_session`. |
| `NEXT_PUBLIC_STATUS_URL` | `#status`, destination for recovery/status links. |
| `NEXT_PUBLIC_SITE_URL` | `https://corral.uzskicorp.agency`, marketing canonical origin. |
| `NEXT_PUBLIC_PADDLE_ENVIRONMENT`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | Public Paddle.js configuration; must agree with the API environment. |

Set `NEXT_PUBLIC_*` before building. Runtime-only changes cannot update an existing browser bundle. WorkOS, Paddle API, AutoSend, Pi, and other provider secrets belong on backend services. See [.env.example](.env.example).

## Build, CSS, and fonts

```sh
pnpm build
pnpm start
```

Development, production compilation, type generation, and Playwright servers use **webpack**. Next tracing/project roots are fixed to `client/`, and Tailwind has an explicit source base, so sibling/repository lockfiles cannot change discovery/output paths. Strict production CSS import order preserves the theme/base/override cascade, with potentially more stylesheet requests.

Inter, Inter Tight, and Geist Mono load in the root layout through `next/font/local`; Newsreader is scoped to `/fenceline`. Committed variable WOFF2 files keep preloading, hashed URLs, swap behavior, and fallback handling without downloading Google Fonts during compilation. See [font notes](app/fonts/README.md).

After compilation, `scripts/verify-build-assets.mjs` checks that home, app, and sign-in link root CSS, design tokens, app selectors, and all three root font files. Outside Vercel it also requires the standalone server. Missing assets fail packaging; this is an artifact check, not browser QA.

Local Compose and Coolify share `client/Dockerfile`, which pins Node 22.23.4/pnpm 12.6.0 and packages the standalone server, `.next/static`, and `public/`. Preserve `/workspace/corral` as the build directory: the earlier `/app` path omitted root-layout styles in this checkout. Public API/Paddle values are build arguments; secrets stay server-side. Routine no-cache rebuilds and source-revision labels are unnecessary.

## Hosting boundaries

- **Coolify:** `../docker-compose.coolify.yml` configures the app at `app.corral.uzskicorp.agency` and API at `api.corral.uzskicorp.agency`. It enables `CORRAL_APP` and matching session cookies. Deployment remains manual.
- **Vercel:** the client is linked to a project; `vercel.json` pins frozen install and guarded webpack build commands. Set Root Directory to `client` and Node to 22.x. The local link does not verify remote domains/settings. App access depends on `CORRAL_APP`.
- **Cloudflare:** `../hosting/landing/` assembles selected prerendered pages into a static Worker site. Its config names `corral.uzskicorp.agency`, with D1 waitlist handling and optional confirmation email. It cannot run authenticated Next server routes or FastAPI. New static pages require an assembly-list entry.

The waitlist endpoint belongs to the Cloudflare Worker. A bare Next/Vercel deployment needs routing or another backend for `/api/waitlist`; a Vercel project link alone does not supply it.

## Developer checks

```sh
pnpm lint
pnpm typecheck       # next typegen --webpack && tsc --noEmit
pnpm build           # compilation + CSS/font artifact guard
pnpm test            # Vitest + Testing Library + MSW
pnpm test:coverage
pnpm test:e2e        # production app + mock API + review server
```

Playwright needs Chromium (`pnpm exec playwright install chromium`) or `PLAYWRIGHT_CHANNEL=chrome`. Baselines live in `e2e/__screenshots__/`; `pnpm test:e2e:update` uses the configured Docker renderer. Review snapshot changes deliberately.

Test execution and UI testing are handed to the developer. Build/type checks do not establish live authentication, delivery, or complete business flows.

## Startup troubleshooting

1. Use Node 22 and pinned pnpm in `client/`; another project's Node version can fail before startup.
2. Use one frontend on 3000. Stop the older process first; do not run webpack and Turbopack against the same `.next/dev` directory.
3. Use `pnpm dev:review` without API/auth dependencies, or `pnpm dev` with configured backend/WorkOS for live data.
4. For deployed font/CSS errors, inspect the failed asset URL and host/build that served the page. Keep HTML and its matching `/_next/static` files together; inspect `pnpm build` output before publishing another copy.
5. Separate unavailable providers from styling failures. Existing recovery screens handle API/auth failures; the root README records unfinished integrations.
