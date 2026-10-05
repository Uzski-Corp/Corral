# Corral
<img width="2560" height="1600" alt="image" src="https://github.com/user-attachments/assets/d919ceb5-641d-45f8-890a-4c4dee79dc59" />


> **AI-native B2B lead intelligence and full-funnel outbound acceleration platform.**
> Replaces brittle single-purpose scrapers and domain-burning blast tools with grounded product knowledge, deterministic deep crawl, waterfall enrichment, and mailbox-protected sequences.

[![Next.js](https://img.shields.io/badge/Frontend-Next.js%2015%2F16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI%20(Python%203.12+)-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%2016%20%2B%20pgvector-336791?style=flat-square&logo=postgresql)](https://github.com/pgvector/pgvector)
[![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind%20CSS%20v4-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-Proprietary%20%2F%20Private-orange?style=flat-square)](#)

---

## At a Glance

Most B2B outbound tooling fails at one of three stages:
1. **Shallow Discovery**: Static databases with stale or generic contact info.
2. **Domain Reputation Destruction**: Blasting cold emails through traditional marketing ESPs that get blacklisted or suspended.
3. **Rigid "Lead Buckets"**: Tying contacts irreversibly to a single campaign rather than scoring them continuously against a live company knowledge base.

**Corral** fixes this with an **AI-native, deterministic pipeline**:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               CORRAL FUNNEL OVERVIEW                                   │
└────────────────────────────────────────────────────────────────────────────────────────┘

  [ 1. KNOWLEDGE BASE ]      Chunked offerings, battlecards & ICP matrices in pgvector
           │
           ▼
  [ 2. STEALTH CRAWL  ]      Serper Google Dorks + Crawl4AI/Playwright anti-bot scraper
           │
           ▼
  [ 3. WATERFALL ENRICH ]    Regex scan ➔ Hunter / Dropcontact ➔ ZeroBounce SMTP verification
           │
           ▼
  [ 4. AI ICP SCORING ]      Structured evaluation against Product KB via LiteLLM + Instructor
           │
           ▼
  [ 5. DUAL-ENGINE SEND ]    Engine 1: Rotated cold mailboxes (30/day, human jitter)
                             Engine 2: AutoSend MCP for warm nurture, drips & alerts
           │
           ▼
  [ 6. UNIBOX & ERP   ]      Instant sentiment triage, Cal.com booking & Phoenix ERP sync
```

---

## Key Architectural Highlights

### 1. Product Knowledge Base Over "Lead Buckets"
Instead of rigid lead buckets where product criteria, filters, and contacts are locked together, Corral decouples them:
- **Product Knowledge Base (The Brain)**: Store value props, ICP criteria, case studies, and objection matrices vectorized with `pgvector`.
- **Master Lead CRM**: A unified, deduplicated company/contact directory. A single prospect can be evaluated concurrently across multiple products (`FitScore = 92%` for Product A, `FitScore = 41%` for Product B).
- **Smart Segments**: Dynamic, saved filter views (e.g., *"Fit > 80% for Enterprise, Retail sector, Verified email, Not contacted"*).

### 2. Dual-Engine Email Deliverability Architecture
Corral cleanly separates cold front-of-funnel outreach from warm lifecycle nurturing:

| Capability | Engine 1: Cold Outbound Pool | Engine 2: AutoSend Lifecycle & Nurture |
| :--- | :--- | :--- |
| **Target Audience** | Unsolicited cold prospects | Replied leads, meeting signups, active clients |
| **Infrastructure** | Rotated Google Workspace / M365 Inboxes | Dedicated ESP infrastructure with AutoSend |
| **Protocol / Interface** | Direct SMTP / OAuth2 API rotation | AutoSend REST API & Native MCP Server |
| **Throughput & Cadence** | Strict 30–35 emails/day per inbox, 2–7m jitter | High-throughput transactional & drip triggers |
| **Format & Headers** | Clean plain-text / human 1-to-1 headers | Responsive rich HTML, CTA blocks, tracking |
| **Reputation Safe** | Protects root domain from spam flags | Isolated from cold outreach spam liabilities |

### 3. "Deterministic Muscle + Agentic Brain"
No wasted LLM tokens clicking through pages sequentially. Corral uses deterministic execution for raw speed, and LLMs strictly for high-leverage reasoning:
- **Deterministic Muscle**: 
  - **Serper.dev**: Resolves 1,000+ domains in <3s via automated dorking.
  - **Crawl4AI + Playwright**: Headless JavaScript rendering with stealth anti-bot evasion and token-efficient Markdown extraction.
  - **Polars**: Ingests, dedupes, and normalizes 50,000+ lead rows in <1.5s.
  - **Waterfall Enrichment**: Cascades from free page scraping to Hunter/Dropcontact APIs, ending in ZeroBounce SMTP verification.
- **Agentic Brain**:
  - **Hermes Agent (Nous Research)**: Persistent-memory Autonomous SDR daemon coordinating subagents (Prospector, Fit Evaluator, Unibox Battlecard, Campaign Orchestrator).
  - **OpenClaw**: Web automation agent for complex SPAs, authenticated portals, and multi-step forms.

### 4. Unified Smart Inbox (Unibox) & Autonomous Copilot
- Real-time reply ingestion via IMAP/webhooks with sub-2s sentiment classification (`Interested`, `Objection`, `OOO`, `Not Interested`).
- Auto-drafts contextual responses grounded in product battlecards and embeds the rep's Cal.com scheduling link.
- Automatically halts active sequences upon response detection.

### 5. Bi-Directional ERP & Cal.com Handoff
- Real-time calendar booking via Cal.com webhooks.
- Authenticated HMAC-SHA256 webhook bridge to upstream ERPs (such as an Elixir Phoenix ERP) to automatically generate live CRM deals and opportunities upon conversion.

---

## Tech Stack

```
corral/
├── client/                     # Next.js 15+ Frontend (React 19, Tailwind v4)
│   ├── app/                    # App Router pages & layout
│   ├── components/             # Radix UI + shadcn/ui components
│   └── lib/                    # State management (Zustand, TanStack Query)
├── backend/                    # FastAPI Backend (Python 3.12+)
│   ├── app/
│   │   ├── api/                # REST endpoints (auth, leads, campaigns, unibox)
│   │   ├── core/               # App config, database session, security
│   │   ├── models/             # SQLAlchemy 2.0 Async + pgvector models
│   │   ├── services/           # Crawl4AI, Waterfall enrichment, LiteLLM
│   │   └── workers/            # ARQ Redis background jobs & email dispatch
│   └── alembic/                # Async DB migrations
└── docker-compose.yml          # Local infra (PostgreSQL 16 pgvector, Redis)
```

### Core Technologies
- **Frontend**: [Next.js 15+](https://nextjs.org/) (App Router, React 19, TypeScript), [Tailwind CSS v4](https://tailwindcss.com/), [TanStack Table v8](https://tanstack.com/table/v8) + [TanStack Virtual](https://tanstack.com/virtual/v3) (60fps scrolling over 20,000+ rows), [Framer Motion](https://www.framer.com/motion/) (Emil Kowalski micro-interaction design system, Brex aesthetic).
- **Backend**: [FastAPI](https://fastapi.tiangolo.com/) (Python 3.12+, Pydantic v2), [SQLAlchemy 2.0 Async](https://www.sqlalchemy.org/) + [Alembic](https://alembic.sqlalchemy.org/).
- **Database & Queue**: [PostgreSQL 16](https://www.postgresql.org/) with [`pgvector`](https://github.com/pgvector/pgvector), [Redis](https://redis.io/) + [ARQ](https://github.com/samuelcolvin/arq).
- **Scraping & Data**: [Crawl4AI](https://github.com/unclecode/crawl4ai), [Playwright](https://playwright.dev/), [Polars](https://pola.rs/).
- **AI & SDR Agents**: [LiteLLM](https://github.com/BerriAI/litellm) + [Instructor](https://github.com/jxnl/instructor), [Hermes Agent](https://github.com/NousResearch/hermes-agent), [OpenClaw](https://github.com/openclaw/openclaw).
- **Lifecycle Engine**: [AutoSend MCP Server & API](https://autosend.com).

---

## Getting Started

### Prerequisites
- **Node.js** 20+ & **pnpm** 9+
- **Python** 3.12+ & [**uv**](https://github.com/astral-sh/uv)
- **Docker** & **Docker Compose**

---

### 1. Start the stack

From the repo root. If you already started this stack once, recreate the network first (`down` keeps the database volume):

```bash
docker compose down
docker compose up --build
```

That builds and starts Postgres 16 (pgvector), Redis, the API, the background worker, and the Next.js app.

- App: http://localhost:3000
- API docs: http://localhost:8000/docs
- Liveness: http://localhost:8000/healthz
- Readiness (Compose waits on this): http://localhost:8000/readyz

Database defaults match `server/.env.example` (`corral` / `corral`, database `corral`). On your machine that Postgres is `localhost:5433`, so it does not fight a database already using port 5432. Copy `server/.env.example` to `server/.env` and add WorkOS keys when you want real sign-in; Compose loads it if it is present. Until those keys are set, auth answers 503.

Only the databases: `docker compose up postgres redis`.

Steps 2 and 3 are the same stack without Docker.

---

### 2. Backend Setup (FastAPI + uv)

```bash
cd backend

# Install dependencies using uv
uv sync

# Install Playwright browser binaries for stealth scraping
uv run playwright install chromium

# Run database migrations
uv run alembic upgrade head

# Start background worker (ARQ)
uv run arq app.workers.worker.WorkerSettings

# Start the API server
uv run uvicorn app.main:app --reload --port 8000
```

The API documentation will be accessible at `http://localhost:8000/docs`.

---

### 3. Frontend Setup (Next.js 15 + pnpm)

```bash
cd client

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

The dashboard will be live at `http://localhost:3000`.

---

## Environment Configuration

Create a `.env` file in `backend/` and `client/` based on the configuration below:

```ini
# --- Database & Cache ---
DATABASE_URL=postgresql+asyncpg://corral_user:corral_password@localhost:5432/corral
REDIS_URL=redis://localhost:6379/0

# --- Search & Deep Scraping ---
SERPER_API_KEY=your_serper_dev_key
PROXY_POOL_URL=http://user:pass@proxy.brightdata.com:22225

# --- AI Models (LiteLLM) ---
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
DEFAULT_FAST_MODEL=gemini/gemini-2.5-flash
DEFAULT_REASONING_MODEL=claude-3-5-sonnet-20241022

# --- Lead Enrichment Fallbacks ---
HUNTER_API_KEY=your_hunter_api_key
ZEROBOUNCE_API_KEY=your_zerobounce_api_key

# --- AutoSend ESP & Nurture Engine (MCP) ---
AUTOSEND_API_KEY=your_autosend_api_key
AUTOSEND_PROJECT_ID=your_autosend_project_id
AUTOSEND_DEFAULT_SENDER_ID=your_sender_id

# --- Autonomous SDR (Hermes Agent / OpenClaw) ---
HERMES_AGENT_ENDPOINT=http://localhost:8080
HERMES_PERSISTENT_MEMORY_PATH=/data/hermes_memory

# --- Calendar & Upstream ERP Integration ---
CAL_API_KEY=your_cal_com_api_key
PHOENIX_ERP_WEBHOOK_URL=https://erp.yourdomain.com/api/webhooks/corral
PHOENIX_ERP_SECRET=your_hmac_sha256_secret
```

---

## Design System & Interface Standards

Corral's client interface is engineered as a high-density, low-latency financial/SaaS instrument:
- **Palette**: Brex-inspired aesthetic — `#ffffff` paper canvas framed by `#000710` (Abyss) and `#15191e` (Carbon), accented with a focused `#ff5900` (Ember) spark for primary actions.
- **Typography**: Compressed geometric neutrality via **Inter** with negative tracking (`-0.01em` to `-0.03em`), paired with **Flecha** for high-impact display moments.
- **Motion & Micro-interactions**: Emil Kowalski design principles — 140ms snappy spring curves, tactile `scale(0.97)` active buttons, zero gratuitous transitions.
- **Virtualization**: TanStack Virtual ensures frictionless 60fps rendering even across tens of thousands of enriched leads.

---

## License

Proprietary and Confidential. Unauthorized copying, distribution, or modification is strictly prohibited.
