# Corral API (FastAPI)

```bash
cd server
uv venv --python 3.12 .venv && source .venv/bin/activate
uv pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env          # fill in DATABASE_URL + WorkOS keys
uvicorn app.main:create_app --factory --reload --port 8000
```

- Health: `GET /health` · API: `/api/v1/*` · Docs: http://localhost:8000/docs
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

## Tests

```bash
pytest --cov                     # unit tests always run
```

Database tests need Postgres and pick, in order: `TEST_DATABASE_URL`
(e.g. `postgresql+asyncpg://postgres@localhost:5432/corral_test`), a disposable
testcontainers Postgres when Docker is running, otherwise they are **skipped** with a reason.
