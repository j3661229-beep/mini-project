# GitPulse âš¡

> **Interactive Visualization Suite for GitHub Repositories** â€” Commit DAG evolution, file ownership/bus-factor risk assessment, and PR review bottleneck network graphs.

---

## ðŸ“Œ Executive Summary & What We Have Done So Far

Existing repository analytics tools (like Gource, GitHub Insights, or git-truck) visualize commit history in isolation. **GitPulse** bridges commit history and team dynamics by pairing a time-scrubbable commit DAG with an interactive directed reviewerâ†”author graph to surface **where team knowledge is fragile** and **where pull request reviews bottleneck development**.

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

## ðŸ— System Architecture & Workflow

```
       â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
       â”‚             React + Vite SPA            â”‚
       â”‚       (D3.js + Tailwind + TS)           â”‚
       â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                            â”‚ REST API (JSON)
                            â–¼
       â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
       â”‚         Django REST Framework           â”‚
       â”‚  POST /api/repositories/ (Trigger)     â”‚
       â”‚  GET  /api/repositories/{id}/status/    â”‚
       â”‚  GET  /api/repositories/{id}/[views]    â”‚
       â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                            â”‚ Task Enqueue
                            â–¼
       â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
       â”‚              Celery Worker              â”‚
       â”‚ â”œâ”€â”€ GitPython  â†’ Shallow clone & parse  â”‚
       â”‚ â”œâ”€â”€ PyGithub   â†’ PRs & review metadata  â”‚
       â”‚ â””â”€â”€ Analysis   â†’ DAG, Bus Factor, Graph â”‚
       â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                            â”‚ Precomputed Data Write
                            â–¼
       â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
       â”‚               PostgreSQL                â”‚
       â”‚    (Commits, PRs, Ownership, Graph)     â”‚
       â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## ðŸ“‚ Project Repository Layout

```
mini/
â”œâ”€â”€ backend/
â”‚   â”œâ”€â”€ analysis/               # Core Analysis Engine
â”‚   â”‚   â”œâ”€â”€ engines/
â”‚   â”‚   â”‚   â”œâ”€â”€ bus_factor.py   # Churn calculation & single-owner risk scoring
â”‚   â”‚   â”‚   â”œâ”€â”€ dag.py          # Commit DAG generation & topological ordering
â”‚   â”‚   â”‚   â””â”€â”€ review_graph.py # NetworkX directed PR review graph builder
â”‚   â”‚   â””â”€â”€ tests/              # Engine unit test fixtures & tests
â”‚   â”œâ”€â”€ config/                 # Django settings, WSGI, ASGI, Celery app config
â”‚   â”œâ”€â”€ repositories/           # Repositories App (Models, Views, Serializers, Tasks)
â”‚   â”‚   â”œâ”€â”€ models.py           # DB Schemas: Repository, Commit, PR, Ownership, Review
â”‚   â”‚   â”œâ”€â”€ tasks.py            # Celery async ingestion & analysis workflow
â”‚   â”‚   â”œâ”€â”€ views.py            # API endpoint viewsets
â”‚   â”‚   â””â”€â”€ serializers.py      # DRF serializers
â”‚   â”œâ”€â”€ manage.py
â”‚   â”œâ”€â”€ pytest.ini
â”‚   â”œâ”€â”€ Procfile
â”‚   â””â”€â”€ requirements.txt
â”œâ”€â”€ frontend/
â”‚   â”œâ”€â”€ src/
â”‚   â”‚   â”œâ”€â”€ api/                # Axios/Fetch API client bindings
â”‚   â”‚   â”œâ”€â”€ components/         # Visualizations & UI Components
â”‚   â”‚   â”‚   â”œâ”€â”€ BranchTimeline.tsx
â”‚   â”‚   â”‚   â”œâ”€â”€ BusFactorPanel.tsx
â”‚   â”‚   â”‚   â”œâ”€â”€ CommitGraph.tsx
â”‚   â”‚   â”‚   â”œâ”€â”€ DashboardSummary.tsx
â”‚   â”‚   â”‚   â”œâ”€â”€ IngestionStatus.tsx
â”‚   â”‚   â”‚   â”œâ”€â”€ RepoInput.tsx
â”‚   â”‚   â”‚   â””â”€â”€ ReviewBottleneckGraph.tsx
â”‚   â”‚   â”œâ”€â”€ hooks/              # Custom React hooks (useRepositoryData, useIngestionStatus)
â”‚   â”‚   â”œâ”€â”€ pages/              # Main view dashboard pages
â”‚   â”‚   â”œâ”€â”€ App.tsx
â”‚   â”‚   â””â”€â”€ main.tsx
â”‚   â”œâ”€â”€ package.json
â”‚   â””â”€â”€ vite.config.ts
â”œâ”€â”€ docker-compose.yml          # Postgres + Redis container stack
â”œâ”€â”€ render.yaml                 # Deployment blueprint for Render
â”œâ”€â”€ .env.example                # Sample environment variables
â””â”€â”€ README.md                   # Comprehensive project documentation & roadmap
```

---

## ðŸ“¡ API Reference

| HTTP Method | Path | Description |
|---|---|---|
| `POST` | `/api/repositories/` | Submit a repository URL for processing. Enqueues background ingestion. |
| `GET` | `/api/repositories/{id}/status/` | Poll ingestion progress (`pending`, `processing`, `complete`, `failed`). |
| `GET` | `/api/repositories/{id}/summary/` | Get top-level dashboard metrics (commit count, author count, risk files). |
| `GET` | `/api/repositories/{id}/commits/` | Retrieve cursor-paginated list of commits with parent hash links. |
| `GET` | `/api/repositories/{id}/ownership/` | Retrieve per-file contributor shares and bus-factor risk flags. |
| `GET` | `/api/repositories/{id}/reviews/` | Retrieve directed reviewer $\rightarrow$ author network graph edges and node stats. |

---

## ðŸš€ Quick Start (Local Setup)

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

## ðŸ—º Project Roadmap

Based on the completed foundation, here is the upcoming development roadmap for GitPulse:

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                    GitPulse Roadmap (v1 to v3)                  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

  [âœ… COMPLETED]  Phase 1: Core Engine & Visualizations (v1.0)
  â”œâ”€â”€ Shallow repository cloning & commit tree extraction
  â”œâ”€â”€ PyGithub integration for PR review metadata
  â”œâ”€â”€ Bus factor & ownership concentration scoring engine
  â”œâ”€â”€ Directed NetworkX reviewer-author bottleneck engine
  â”œâ”€â”€ Interactive D3.js Commit DAG, Bus Factor Panel, and Review Graph
  â””â”€â”€ Docker Compose & Render deployment blueprints

  [â³ UPCOMING]   Phase 2: Advanced Visualizations & Insights (v1.1)
  â”œâ”€â”€ File Churn vs. Ownership Heatmap Matrix
  â”œâ”€â”€ Contributor Activity Calendar & Timeline Scruber
  â”œâ”€â”€ Subdirectory-level Bus Factor Rollup summaries
  â””â”€â”€ Exportable Risk Reports (PDF / JSON summary download)

  [ðŸ”® PLANNED]    Phase 3: Auth & Private Repositories (v2.0)
  â”œâ”€â”€ GitHub OAuth 2.0 Integration
  â”œâ”€â”€ Private Repository Access & Ingestion
  â”œâ”€â”€ Team / Organization Workspaces & Permission Scopes
  â””â”€â”€ Persistent Database Caching per Organization

  [ðŸš€ FUTURE]     Phase 4: Real-Time Alerts & Integration (v3.0)
  â”œâ”€â”€ Slack & Microsoft Teams Webhook Alerts on High Risk Commits
  â”œâ”€â”€ GitHub Action integration for PR Bus-Factor Impact Checks
  â””â”€â”€ Multi-Repository Cross-Project Dependency & Bottleneck Graph
```

---

## ðŸ”’ Security & Best Practices

- **Token Safety**: GitHub API tokens are kept server-side inside Celery execution context and are never exposed to the client bundle.
- **Input Sanitization**: Repository URLs are validated against standard GitHub pattern schemas before invocation by GitPython to prevent injection.
- **Ingestion Caps**: Ingestion commit depth is bounded by `INGESTION_COMMIT_CAP` (default 2,000) to ensure high responsiveness and memory protection.

---

## ðŸ“„ License

Distributed under the MIT License. See `LICENSE` for details.

---

## Current intelligence capabilities

GitPulse now provides the following verified repository-intelligence capabilities:

- Real ingestion-stage polling for cloning, commit parsing, reviews, ownership analysis, completion, and failure.
- Collision-safe temporary clone workspaces for simultaneous and repeated repository analyses.
- Contributor activity intelligence using recorded commit history, with 30/90/365-day windows and contributor filtering.
- Directory ownership rollups computed from recorded commit-file churn, including dominant contributor, ownership share, contributor count, bus-factor estimate, churn, affected files, and the existing high-concentration risk threshold.
- JSON and PDF risk reports generated from the same stored repository, ownership, review, activity, and directory data.

### Additional API endpoints

| HTTP Method | Path | Description |
|---|---|---|
| `GET` | `/api/repositories/{id}/activity/?days=30|90|365&contributor=` | Bounded daily commit activity and contributor summaries. |
| `GET` | `/api/repositories/{id}/directory-ownership/?depth=1` | Directory-level churn, ownership, bus-factor, and risk rollups. |
| `GET` | `/api/repositories/{id}/risk-report/` | Download the JSON repository risk report. |
| `GET` | `/api/repositories/{id}/risk-report/pdf/` | Download the paginated PDF repository risk report. |
### Large-repository processing status

Repository status polling now includes worker-persisted progress rather than simulated frontend progress:

- `ingestion_stage`: current core ingestion stage.
- `ingestion_progress`: optional `processed`, `total`, and worker-provided `detail` fields.
- `ingestion_stage_started_at` and `ingestion_heartbeat_at`: timestamps used by the UI to distinguish active work from a slow update.

Commit parsing records real completed commit counts in batches of ten. Totals are shown only after Git has discovered them. The pipeline remains incremental: previously stored commit hashes skip repeat file-stat extraction. Semantic chunk generation now fetches existing chunk hashes once for the repository instead of issuing one existence query per candidate chunk.