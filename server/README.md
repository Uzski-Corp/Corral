# Corral API (FastAPI)

```bash
cd server
uv venv --python 3.12 .venv && source .venv/bin/activate
uv pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env          # fill in DATABASE_URL + WorkOS keys
uvicorn app.main:create_app --factory --reload --port 8000
```

- Worker: `arq app.worker.main.WorkerSettings` (same `.env`; needs Redis)
- Probes: `GET /healthz` (liveness, `/health` alias) · `GET /readyz` (DB + Redis, 503 while
  draining) · `GET /metrics` (Prometheus) · API: `/api/v1/*` · Docs: http://localhost:8000/docs
- Lint/format/types: `ruff check . && ruff format --check . && mypy`
- Migrations: `alembic revision --autogenerate -m "msg"` then `alembic upgrade head` (needs Postgres)

## Auth (WorkOS AuthKit)

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/auth/login[?screen_hint=sign-up]` | Redirects to AuthKit; binds a random `state` to a short-lived HttpOnly cookie (login-CSRF protection). |
| `GET /api/v1/auth/callback` | Verifies `state`, exchanges the code, upserts the local **user**, **organization** (WorkOS org, or a personal workspace) and **membership**, sets the sealed `wos_session` cookie, redirects to `FRONTEND_URL`. Failures redirect to `FRONTEND_URL/sign-in?error=<code>`. |
| `POST /api/v1/auth/refresh` | Forces a refresh-token rotation and re-seals the cookie. |
| `POST /api/v1/auth/logout` | Clears the cookie and returns `{"logout_url": ...}` to end the hosted WorkOS session. |
| `GET /api/v1/auth/me` | Current user, organization and role. |

Every other `/api/v1/*` router is mounted with `Depends(require_auth)`; a test enumerates
the OpenAPI schema to prove no non-public route answers anonymously. Handlers use the
`CurrentUser` / `CurrentOrg` dependencies. Expired access tokens are refreshed
transparently and the new cookie is written on the response.

`WORKOS_COOKIE_PASSWORD` must be a Fernet key:
`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`.
Without WorkOS keys the API still boots locally and auth endpoints answer 503;
`APP_ENV=staging|production` refuses to start without them.

## Tenancy & row-level security

Tenant isolation is enforced twice:

1. **Repositories** (`app/repositories`) are constructed with the caller's `org_id`
   (`Depends(repository(LeadRepository))`); every query filters by it and every insert is
   stamped with it. `id`/`org_id` can't be set by callers, and bodies use `extra="forbid"`.
2. **Postgres RLS** (migration `0003_row_level_security`). Each request transaction
   switches to the NOLOGIN role `corral_app` (`set_config('role', ...)`, lazily on first
   DB use), and the auth dependency sets transaction-local `app.current_org` /
   `app.current_user_id`. Policies on `organizations`, `memberships`, `users` and every
   domain table key off those settings, so even a query that forgets the filter only sees
   the current org. With no tenant context set, those tables look empty.

Sign-in happens before a tenant is known, so two narrowly scoped `SECURITY DEFINER`
functions (`app_provision_identity`, `app_resolve_membership`) are the only cross-tenant
path; `PUBLIC` cannot execute them.

Operational requirements:
- Run `alembic upgrade head` as the role that owns the schema. It creates `corral_app`
  (if missing) and grants it to `CURRENT_USER`, so it needs `CREATEROLE` (or run it as a
  superuser). The API's login role must be a member of `corral_app`; if it isn't the
  migration role, run `GRANT corral_app TO <api_login_role>`.
- New org-scoped tables: subclass `TenantModel`, add a migration, and add the table to the
  RLS migration pattern (`ENABLE ROW LEVEL SECURITY` + `tenant_isolation` policy + grants).

## Background jobs & observability

- Jobs live in `app/worker/jobs.py` and are registered in `app/worker/main.py`. Enqueue from
  request handlers via `request.app.state.queue` (typed helpers such as
  `JobQueue.enqueue_count_org_leads`, deduplicated by job id). Jobs taking `org_id`
  open their own session with the tenant context pinned, so RLS applies in the worker too.
  Transient failures raise `arq.Retry` with backoff, capped by `WORKER_MAX_TRIES`; each job is
  bounded by `WORKER_JOB_TIMEOUT_S`.
- Every response carries `X-Request-ID` (incoming valid IDs are propagated) and it is bound to
  the structured access log line. Requests past `REQUEST_TIMEOUT_S` return 504.
- Metrics: `http_requests_total`, `http_request_duration_seconds`, `http_requests_in_progress`,
  labelled by route template (never raw paths) to keep cardinality bounded.
- Tracing: set `OTEL_ENABLED=true` and `OTEL_EXPORTER_OTLP_ENDPOINT`; FastAPI and SQLAlchemy
  spans are exported over OTLP/HTTP.
- Shutdown: when the lifespan exits (SIGTERM) `/readyz` flips to 503 first, then the queue
  pool, telemetry and DB are closed in that order.

## Tests

```bash
pytest --cov                     # unit tests always run
```

Database tests need Postgres and pick, in order: `TEST_DATABASE_URL`
(e.g. `postgresql+asyncpg://postgres@localhost:5432/corral_test`), a disposable
testcontainers Postgres when Docker is running, otherwise they are **skipped** with a reason.
The suite applies the real Alembic migrations, runs up/down/up round trips in a scratch
database (so the DB user needs `CREATEDB`), and checks models match migrations.
Redis-backed tests (queue, worker, readiness) use `TEST_REDIS_URL` (e.g.
`redis://localhost:6379/15`; the DB is flushed), then a testcontainers Redis, else skip.
