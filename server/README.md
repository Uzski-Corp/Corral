# Corral API (FastAPI)

```bash
cd server
uv venv --python 3.12 .venv && source .venv/bin/activate
uv pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env          # fill in DATABASE_URL + WorkOS keys
uvicorn app.main:app --reload --port 8000
```

- Health: `GET /health` · API: `/api/v1/*` · Docs: http://localhost:8000/docs
- Tests: `pytest` · Lint: `ruff check .`
- Migrations: `alembic revision --autogenerate -m "msg"` then `alembic upgrade head` (needs Postgres)
- Auth: WorkOS AuthKit. `/api/v1/auth/login` → hosted sign-in → `/auth/callback` sets a sealed `wos_session` cookie → `/auth/me`.
  `WORKOS_COOKIE_PASSWORD` must be a Fernet key: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
