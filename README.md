# Corral

Corral is a workspace for organizing product knowledge, companies, contacts, and sales conversations. A Next.js client talks to a tenant-scoped FastAPI API, with background processing for documents, CSV imports, demo email, billing, and AI reply suggestions.

The repository contains API-backed flows, design-review fixtures, and unfinished integrations. This README describes the current implementation rather than the broader claims on the marketing pages.

## What works in the source

| Area | Current implementation |
| --- | --- |
| Authentication and setup | WorkOS email-code and hosted OAuth sign-in, sealed session cookies, persisted onboarding, workspace/profile settings, first-product setup, and public-site reading. New accounts start empty. |
| Products and knowledge | Product CRUD; PDF, DOCX, Markdown, and public-URL ingestion; background parsing, chunking, embeddings, source recovery, and passage search. Original uploads are stored in Postgres. Local hashing embeddings are the default; an OpenAI-compatible provider is optional. |
| Companies and contacts | Company/person records, per-product fit records, filtering, cursor pagination, saved segments, bulk actions, duplicate merging, unsubscribe, and background CSV imports with mapping and dry runs. |
| Unibox | Stored conversations, messages, drafts, triage, and handled/snoozed states. Real AutoSend transport is restricted to one configured demo workspace and an explicit recipient allowlist, with durable delivery intent and distinct uncertain-delivery states. |
| AI reply suggestions | Postgres tracks runs; the worker submits and reconciles them with Pi. Pi reads a bound thread and selected product's knowledge passages. Suggestions require an explicit action before replacing a draft and never send email themselves. Currently restricted to the demo workspace. |
| Discovery | Stores runs, deducts estimated workspace credits, and submits requests to Pi when configured. The completion pipeline is unfinished, as described below. |
| Sequences and settings | Persists sequence drafts/status, mailbox records, integration status/configuration, Phoenix field mappings, API-key lifecycle, and MCP connection records. |
| Billing | Seven-day workspace trial, Paddle checkout/portal integration, signed webhook intake, background subscription projection, and entitlements. Access enforcement defaults to off. |
| SMS | Signed-in ThriveVAS playground when configured. Billing reminder SMS is a separate unfinished integration. |
| Public site | Marketing, pricing, security, changelog, legal, and payment pages. A separate Cloudflare Worker serves selected prerendered pages and a D1 waitlist with optional AutoSend confirmation email. |

## Current limits

- Discovery's Pi task generates candidate text with an empty tool registry. Web search/crawling, verified contact enrichment, completion reconciliation, and automatic CRM import are not wired. Submission does not establish discovered or verified companies.
- Sequence creation, launch, and pause persist state but do not run an outbound scheduler. Customer mailbox OAuth, SMTP rotation, and general mailbox delivery are not implemented. Real mail transport is the allowlisted AutoSend demo flow.
- Cal.com, Phoenix, and general AutoSend integration controls store status/configuration; they do not authorize providers or execute booking/ERP handoffs. Developer screens manage records and secrets; the API does not expose a functioning MCP server.
- Pending team invitations are stored; invitation delivery/acceptance is not wired. Workspace/profile image uploads require configured Cloudflare R2.
- Billing has no yearly checkout, refunds, or plan-change flow. Company/draft/mailbox allowances are displayed, not count-enforced. Billing reminder SMS has no sending provider.
- Provider credentials, webhooks, and manual end-to-end testing are required for enabled integrations. Review fixtures and marketing examples do not establish live provider behavior.

## Architecture

```text
Browser
  └─ Next.js client — routes, session context, typed fetch clients
       └─ FastAPI /api/v1 — WorkOS sessions and tenant authorization
            ├─ Postgres + pgvector — workspace data, files, outbox, billing/AI state
            ├─ Redis + arq — ingestion/import jobs and scheduled reconciliation
            ├─ WorkOS / Paddle / AutoSend / ThriveVAS / R2
            └─ Pi service — authenticated HTTP, separate Node runtime
                 ├─ OpenAI model provider
                 ├─ scoped read-only tools back to FastAPI for replies
                 └─ SQLite checkpoints and persisted reply-run budgets

Static marketing path
  client/.next → hosting/landing/assemble.mjs → Cloudflare Worker assets
                                               └─ D1 waitlist + confirmation email
```

FastAPI owns authentication, membership, permissions, and durable business state. Requests and jobs set transaction-local tenant context and use Postgres row-level security under the unprivileged `corral_app` role. Browser writes require an allowed origin. Provider webhooks use signature checks; private Pi tools use run-scoped credentials.

The arq worker processes knowledge ingestion, CSV imports, billing events, and short reconciliation cycles for demo mail and AI replies. Pi executes model conversations separately, using its own model key and a single-owner local data directory. Reply runs have deadlines, cancellation, model/tool budgets, and validation of cited passage IDs.

## Repository and stack

| Location | Responsibility |
| --- | --- |
| `client/` | Next.js 16.3.6, React 19.2.8, TypeScript, Tailwind CSS 4, custom components/CSS, Phosphor icons. |
| `client/components/session/` | Session confirmation, live API context, persisted onboarding. |
| `client/lib/api/` | Typed fetch clients, deadlines, response decoders, and API errors. |
| `server/` | Python 3.12, FastAPI, async SQLAlchemy, Alembic, Postgres/pgvector, Redis/arq. |
| `server/app/{kb,leads,mail,ai,billing}/` | Business services; routes are under `app/api/v1/routes/`. |
| `services/pi-intelligence/` | Node 24+, Pi Durable/AI/Chord, OpenAI, SQLite checkpoints. Separate npm lockfile. |
| `hosting/landing/` | Static site assembly, Cloudflare Worker, D1 waitlist. |
| `docker-compose.yml` | Local Postgres, Redis, API, worker, frontend. |
| `docker-compose.demo.yml` | Optional local Pi overlay. |
| `docker-compose.coolify.yml` | Hosted app stack using an external Pi service. |

The client uses React context/hooks and typed `fetch`, not Zustand or TanStack Query. TanStack Table/Virtual, shadcn/Radix, Framer Motion, Crawl4AI, Hunter, and the earlier Hermes/OpenClaw architecture are not current dependencies. See the actual package manifests and [`server/requirements.txt`](server/requirements.txt).

## Local setup

### Interface without an API

Use Node **22.x** and pnpm **12.6.0**, pinned in `client/package.json`. Run client commands inside `client/`:

```sh
cd client
nvm use
pnpm install --frozen-lockfile
cp .env.example .env.local  # only if this file does not already exist
pnpm dev:review
```

Open [localhost:3000/app](http://localhost:3000/app). Review mode bypasses auth and uses sample data. Never enable `NEXT_PUBLIC_DESIGN_REVIEW` on a real deployment.

### Full stack

Copy `server/.env.example` to `server/.env` if needed and configure WorkOS for real sign-in. From the repository root:

```sh
docker compose up --build
```

| Service | Address |
| --- | --- |
| App | http://localhost:3000 |
| API docs | http://localhost:8000/docs |
| Liveness / readiness | http://localhost:8000/healthz · http://localhost:8000/readyz |
| Postgres | `localhost:5433`, user/password/database `corral` |
| Redis | `localhost:6379` |

The API container waits for Postgres and runs its migration wrapper before serving. Worker/frontend startup waits for API readiness. Local Compose uses a fixed DB/Redis subnet; if an existing stack has the older network definition, recreate its network with `docker compose down` before starting again. Preserve the database volume unless erasure is intended.

For frontend hot reload, stop Docker's frontend with `docker compose stop web`, leave the API/worker/databases running, then run `pnpm dev` in `client/`. It enables the app locally and binds 3000 explicitly. Use `localhost` on both sides so session cookies reach the app.

For host-based Python setup, follow [`server/README.md`](server/README.md). The entry points are `uvicorn app.main:create_app --factory --reload --port 8000` and `arq app.worker.main.WorkerSettings`. Use database port **5433** when connecting from the host to Compose; the server env example defaults to 5432.

### Optional local Pi

Copy `services/pi-intelligence/.env.example` to `.env`, configure the model key and a `PI_SERVICE_TOKEN` of at least 32 characters, and put the same token in `server/.env`:

```sh
docker compose -f docker-compose.yml -f docker-compose.demo.yml up --build
```

The overlay connects API/worker to `http://pi:8090` and Pi back to `http://api:8000`, without a published Pi port. Pi requires single-owner local disk. Running it directly requires Node 24+ and Linux `flock`; install its separate dependencies with `npm ci --ignore-scripts`.

## Configuration

Use [`server/.env.example`](server/.env.example), [`client/.env.example`](client/.env.example), and [`services/pi-intelligence/.env.example`](services/pi-intelligence/.env.example) as the variable references.

- WorkOS needs API/client IDs, a Fernet cookie password, and the API callback URL. Local boot without WorkOS returns 503 from auth; staging/production configuration requires credentials.
- Frontend/CORS origins, callback URL, and session cookie names must agree. Keep provider secrets on the API or Pi service.
- `NEXT_PUBLIC_*` values are compiled into browser assets. Set API origin and public Paddle values before building; runtime-only changes cannot update an existing bundle.
- AutoSend demo mail needs its workspace UUID, sender, reply-to address, recipient allowlist, and signed inbound/delivery webhooks. See [`docs/DEMO-HANDOFF.md`](docs/DEMO-HANDOFF.md) for the manual exercise; deployment observations there are dated.
- `BILLING_ENFORCE_ACCESS` defaults to false. Its current gate covers new KB ingestion/re-reads and CSV imports that write rows, rather than every app feature.

## Hosting and build paths

| Path | Responsibility |
| --- | --- |
| Coolify | `docker-compose.coolify.yml` configures the frontend at `app.corral.uzskicorp.agency` and API at `api.corral.uzskicorp.agency`. Pi runs externally on Rumpty through `PI_SERVICE_URL`. |
| Vercel | The client is linked to a Vercel project. `client/vercel.json` pins frozen install and guarded webpack build commands. Root Directory must be `client`, Node must be 22.x, and app access depends on `CORRAL_APP`. The local link does not verify remote domains/settings. |
| Cloudflare | `hosting/landing/cloudflare.config.ts` configures `corral.uzskicorp.agency`. Assembly copies selected prerendered pages and static assets; the Worker adds waitlist handling. It does not run FastAPI or authenticated Next server routes. |

Local Docker and Coolify share `client/Dockerfile`, standalone output, and static/public assets. Preserve its `/workspace/corral` build directory: this checkout's earlier `/app` path omitted root-layout styles. Next tracing and Tailwind source roots are explicit. Development, production compilation, type generation, and Playwright servers use webpack; production CSS preserves strict import order.

Fonts are committed variable WOFF2 files loaded through `next/font/local`, so compilation does not fetch Google Fonts. `pnpm build` checks root CSS and emitted font files on home, app, and sign-in before packaging. This artifact check is separate from tests and browser QA. See [`client/README.md`](client/README.md) and [`hosting/landing/README.md`](hosting/landing/README.md).

Coolify's configured serialized build command is `docker compose --progress plain --parallel 1 build`. Deployment and merging remain separate manual decisions.

## Checks and verification boundary

Client commands: `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm test:coverage`, and `pnpm test:e2e`. Tests use Vitest/Testing Library/MSW and Playwright. API commands and database requirements are in [`server/README.md`](server/README.md); Pi has `npm run check`.

Build/type/lint checks do not establish live auth, payment, discovery, email, or SMS behavior. Exercise configured integrations manually and distinguish provider acceptance from delivery. Test execution and UI QA are handed to the developer.

## License

Proprietary and confidential. Third-party font licenses are included in `client/app/fonts/licenses/`.
