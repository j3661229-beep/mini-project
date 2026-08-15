# GitPulse ⚡

> **Interactive Visualization Suite for GitHub Repositories** — Commit DAG evolution, file ownership/bus-factor risk assessment, and PR review bottleneck network graphs.

---

## 📌 Executive Summary & What We Have Done So Far

Existing repository analytics tools (like Gource, GitHub Insights, or git-truck) visualize commit history in isolation. **GitPulse** bridges commit history and team dynamics by pairing a time-scrubbable commit DAG with an interactive directed reviewer↔author graph to surface **where team knowledge is fragile** and **where pull request reviews bottleneck development**.

### Summary of Completed Milestones

#### 1. Backend Ingestion & Async Architecture (`/backend`)
- **Django REST Framework (DRF)** RESTful API endpoints for repository management, analysis status polling, and dataset retrieval.
- **Asynchronous Task Processing with Celery & Redis**: Background job queue handles heavy Git cloning and API fetching without blocking HTTP request threads. Supports an optional synchronous eager mode (`CELERY_TASK_ALWAYS_EAGER=True`) for easy local development without Redis.
- **Git & GitHub Scraping Pipelines**:
  - **GitPython Integration**: Perform shallow repo clones, commit parsing, parent hash linking, and file change insertion/deletion extraction.
  - **PyGithub Integration**: Scrape pull request metadata, reviewer lists, approval states, and merge timings from the GitHub REST API.

#### 2. Specialized Analysis Engines (`/backend/analysis/engines`)
- **`dag.py` (Commit DAG & Topological Engine)**:
  - Constructs parent-child commit dependency trees.
  - Computes commit depth, topological sorting, and branch path linkages for time-series playback.
- **`bus_factor.py` (File Ownership & Risk Engine)**:
  - Aggregates per-file line churn (`insertions + deletions`) across all commits.
  - Computes top contributor ownership percentage.
  - **Risk Identification**: Automatically flags files with $\ge 80\%$ single-author ownership concentration as single-point-of-failure risks.
- **`review_graph.py` (Reviewer Bottleneck & Network Engine)**:
  - Builds directed network graphs ($Reviewer \rightarrow Author$) using **NetworkX**.
  - Calculates degree metrics, review frequency counts, high-reliance nodes, and low-reciprocity reviewer/author relationships.

#### 3. Database Schema & Data Models (`backend/repositories/models.py`)
- `Repository`: Metadata, sync status (`pending`, `processing`, `complete`, `failed`), error logs, and commit cap tracking.
- `Commit`: Hash, author details, timestamp, branch, and JSON array of parent hashes.
- `CommitFile`: File-level insertion and deletion stats linked to commits.
- `PullRequest`: PR numbers, author logins, states, creation, and merge timestamps.
- `PRReview`: Reviewer logins and review state outcomes (`APPROVED`, `CHANGES_REQUESTED`, etc.).
- `FileOwnership`: Precalculated per-file contributor shares, total churn, and bus-factor risk flags.

#### 4. Interactive Frontend Application (`/frontend`)
- Built with **React 18**, **TypeScript**, **Vite**, **Tailwind CSS**, and **D3.js**.
- **Components & Features Shipped**:
  - `RepoInput.tsx`: Input form with repo URL validation, sanitization, and instant submit.
  - `IngestionStatus.tsx`: Real-time status polling banner showing cloning and analysis progress.
  - `DashboardSummary.tsx`: Top-level stat cards displaying total commits, total authors, high-risk file count, and PR review volume.
  - `CommitGraph.tsx`: Interactive SVG time-scrubbable commit DAG visualizer with play/pause controls.
  - `BranchTimeline.tsx`: Branch creation, merge event visualization, and activity timeline.
  - `BusFactorPanel.tsx`: High-risk file breakdown with threshold toggles and visual ownership progress bars.
  - `ReviewBottleneckGraph.tsx`: Interactive D3 force-directed review network showing directed edges, high-reliance hubs, and reviewer bottlenecks.

#### 5. Automated Test Suite (`backend/analysis/tests/` & `backend/repositories/tests.py`)
- Full unit test coverage via **pytest** for analysis engines (`test_dag.py`, `test_bus_factor.py`, `test_review_graph.py`).
- Isolated fixture-based tests verifying algorithms without requiring live Git clones or live GitHub network requests.

#### 6. Production Infrastructure & Deployment Configurations
- `docker-compose.yml`: One-command containerization for local PostgreSQL, Redis, Django API, and Celery worker.
- `render.yaml`: Production Blueprint configuration for Render deployment (Web API + Background Worker + Managed Redis + Managed Postgres).
- `Procfile` & `pytest.ini`: Pre-configured build, migration, worker start, and test discovery commands.

---

## 🏗 System Architecture & Workflow

```
       ┌─────────────────────────────────────────┐
       │             React + Vite SPA            │
       │       (D3.js + Tailwind + TS)           │
       └────────────────────┬────────────────────┘
                            │ REST API (JSON)
                            ▼
       ┌─────────────────────────────────────────┐
       │         Django REST Framework           │
       │  POST /api/repositories/ (Trigger)     │
       │  GET  /api/repositories/{id}/status/    │
       │  GET  /api/repositories/{id}/[views]    │
       └────────────────────┬────────────────────┘
                            │ Task Enqueue
                            ▼
       ┌─────────────────────────────────────────┐
       │              Celery Worker              │
       │ ├── GitPython  → Shallow clone & parse  │
       │ ├── PyGithub   → PRs & review metadata  │
       │ └── Analysis   → DAG, Bus Factor, Graph │
       └────────────────────┬────────────────────┘
                            │ Precomputed Data Write
                            ▼
       ┌─────────────────────────────────────────┐
       │               PostgreSQL                │
       │    (Commits, PRs, Ownership, Graph)     │
       └─────────────────────────────────────────┘
```

---

## 📂 Project Repository Layout

```
mini/
├── backend/
│   ├── analysis/               # Core Analysis Engine
│   │   ├── engines/
│   │   │   ├── bus_factor.py   # Churn calculation & single-owner risk scoring
│   │   │   ├── dag.py          # Commit DAG generation & topological ordering
│   │   │   └── review_graph.py # NetworkX directed PR review graph builder
│   │   └── tests/              # Engine unit test fixtures & tests
│   ├── config/                 # Django settings, WSGI, ASGI, Celery app config
│   ├── repositories/           # Repositories App (Models, Views, Serializers, Tasks)
│   │   ├── models.py           # DB Schemas: Repository, Commit, PR, Ownership, Review
│   │   ├── tasks.py            # Celery async ingestion & analysis workflow
│   │   ├── views.py            # API endpoint viewsets
│   │   └── serializers.py      # DRF serializers
│   ├── manage.py
│   ├── pytest.ini
│   ├── Procfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/                # Axios/Fetch API client bindings
│   │   ├── components/         # Visualizations & UI Components
│   │   │   ├── BranchTimeline.tsx
│   │   │   ├── BusFactorPanel.tsx
│   │   │   ├── CommitGraph.tsx
│   │   │   ├── DashboardSummary.tsx
│   │   │   ├── IngestionStatus.tsx
│   │   │   ├── RepoInput.tsx
│   │   │   └── ReviewBottleneckGraph.tsx
│   │   ├── hooks/              # Custom React hooks (useRepositoryData, useIngestionStatus)
│   │   ├── pages/              # Main view dashboard pages
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml          # Postgres + Redis container stack
├── render.yaml                 # Deployment blueprint for Render
├── .env.example                # Sample environment variables
└── README.md                   # Comprehensive project documentation & roadmap
```

---

## 📡 API Reference

| HTTP Method | Path | Description |
|---|---|---|
| `POST` | `/api/repositories/` | Submit a repository URL for processing. Enqueues background ingestion. |
| `GET` | `/api/repositories/{id}/status/` | Poll ingestion progress (`pending`, `processing`, `complete`, `failed`). |
| `GET` | `/api/repositories/{id}/summary/` | Get top-level dashboard metrics (commit count, author count, risk files). |
| `GET` | `/api/repositories/{id}/commits/` | Retrieve cursor-paginated list of commits with parent hash links. |
| `GET` | `/api/repositories/{id}/ownership/` | Retrieve per-file contributor shares and bus-factor risk flags. |
| `GET` | `/api/repositories/{id}/reviews/` | Retrieve directed reviewer $\rightarrow$ author network graph edges and node stats. |

---

## 🚀 Quick Start (Local Setup)

### Prerequisites
- **Python**: 3.11+
- **Node.js**: 20+
- **Git** installed on your system
- *(Optional)* **Docker Desktop** for running PostgreSQL + Redis locally.

---

### Step 1: Environment Setup
Copy the sample environment file:
```bash
cp .env.example .env
```
*(Optional but recommended)* Add a personal GitHub Token in `.env` to prevent GitHub API rate limits:
```env
GITHUB_TOKEN=ghp_your_token_here
CELERY_TASK_ALWAYS_EAGER=True
```

---

### Step 2: Backend Setup
```bash
cd backend
python -m venv .venv

# On Windows:
.venv\Scripts\activate
# On macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```
The Django API will start on **http://127.0.0.1:8000**.

> **Note on Celery**: By default with `CELERY_TASK_ALWAYS_EAGER=True`, tasks execute synchronously in the Django web process. To run with a real worker, start Redis via Docker (`docker compose up -d redis`), set `CELERY_TASK_ALWAYS_EAGER=False` in `.env`, and run `celery -A config worker -l info`.

---

### Step 3: Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Open **http://localhost:5173** in your browser. Vite automatically proxies `/api` calls to Django on port `8000`.

---

### Step 4: Run Automated Tests
```bash
cd backend
pytest
```
All analysis engines and URL validator tests will execute using fixture data without triggering network or Git requests.

---

## 🗺 Project Roadmap

Based on the completed foundation, here is the upcoming development roadmap for GitPulse:

```
┌─────────────────────────────────────────────────────────────────┐
│                    GitPulse Roadmap (v1 to v3)                  │
└─────────────────────────────────────────────────────────────────┘

  [✅ COMPLETED]  Phase 1: Core Engine & Visualizations (v1.0)
  ├── Shallow repository cloning & commit tree extraction
  ├── PyGithub integration for PR review metadata
  ├── Bus factor & ownership concentration scoring engine
  ├── Directed NetworkX reviewer-author bottleneck engine
  ├── Interactive D3.js Commit DAG, Bus Factor Panel, and Review Graph
  └── Docker Compose & Render deployment blueprints

  [⏳ UPCOMING]   Phase 2: Advanced Visualizations & Insights (v1.1)
  ├── File Churn vs. Ownership Heatmap Matrix
  ├── Contributor Activity Calendar & Timeline Scruber
  ├── Subdirectory-level Bus Factor Rollup summaries
  └── Exportable Risk Reports (PDF / JSON summary download)

  [🔮 PLANNED]    Phase 3: Auth & Private Repositories (v2.0)
  ├── GitHub OAuth 2.0 Integration
  ├── Private Repository Access & Ingestion
  ├── Team / Organization Workspaces & Permission Scopes
  └── Persistent Database Caching per Organization

  [🚀 FUTURE]     Phase 4: Real-Time Alerts & Integration (v3.0)
  ├── Slack & Microsoft Teams Webhook Alerts on High Risk Commits
  ├── GitHub Action integration for PR Bus-Factor Impact Checks
  └── Multi-Repository Cross-Project Dependency & Bottleneck Graph
```

---

## 🔒 Security & Best Practices

- **Token Safety**: GitHub API tokens are kept server-side inside Celery execution context and are never exposed to the client bundle.
- **Input Sanitization**: Repository URLs are validated against standard GitHub pattern schemas before invocation by GitPython to prevent injection.
- **Ingestion Caps**: Ingestion commit depth is bounded by `INGESTION_COMMIT_CAP` (default 2,000) to ensure high responsiveness and memory protection.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.
