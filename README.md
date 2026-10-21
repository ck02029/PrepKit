# PrepKit

PrepKit turns a job description into a researched interview preparation kit. It combines a Next.js and Tailwind interface, a Node.js and Express API, PostgreSQL, and a separate background worker. It supports account-based kits, batch creation, section editing and regeneration, practice sessions, flashcards, and a day-by-day schedule.

This repository uses PostgreSQL rather than the assessment's preferred MongoDB. PostgreSQL transactions and foreign keys fit ownership checks, durable job processing, and practice history; JSONB stores the versioned kit document while indexed relational tables support querying and progress. TypeScript is used across the stack, and the shared kit contract is in `packages/kit-schema`.

## Quick start

### Docker Compose

Requirements: Docker Desktop (or Docker Engine with Compose), and an AI provider key for generation.

Create local environment files from the tracked templates:

```powershell
Copy-Item .env.example .env
Copy-Item backend/.env.example backend/.env
```

Edit `.env` and `backend/.env`: set a long random database password in the first file, use that same password in `DATABASE_URL` in the second, replace `SESSION_SECRET` with at least 32 random characters, and set either `GEMINI_API_KEY` or `OPENAI_API_KEY`. Keep these local files private; they are ignored by Git.

Build and start PostgreSQL, the API, the worker, and the frontend:

```powershell
docker compose up --build -d
docker compose ps
```

Open [http://localhost:3000](http://localhost:3000). The frontend uses a same-origin `/api` proxy to the API container. View service logs with `docker compose logs -f backend worker frontend`. Stop services with `docker compose down`; the named database volume remains. Add `-v` only if you intentionally want to delete that database volume and its data.

### Local Node.js development

Install Node.js 22 and npm, set up the same environment files as above, and start PostgreSQL with `docker compose up -d postgres`. In three repository-root terminals, run:

```powershell
npm run dev:api --workspace backend
```

```powershell
npm run dev:worker --workspace backend
```

```powershell
npm run dev --workspace frontend
```

The frontend defaults to [http://localhost:3000](http://localhost:3000) and proxies API calls to `http://localhost:8000`. If Next.js picks another port, add that browser origin to `FRONTEND_ORIGIN` in `backend/.env` and restart the API. The backend loads its env file relative to the backend workspace; do not put provider credentials in frontend environment variables.

For component-level setup and implementation details, see [frontend/README.md](frontend/README.md) and [backend/README.md](backend/README.md).

## Product workflow

1. Register or sign in. Users can access only their own kits.
2. Paste a job description, provide a company website (or company name for homepage discovery), and choose the number of preparation days. Batch mode accepts multiple role inputs from a JSON file.
3. A durable background job researches sources, extracts evidence-backed requirements, generates kit sections, checks question coverage, and builds the schedule. Progress, skipped sources, partial results, quota waits, and failures are visible in the app.
4. Edit, reorder, add, remove, or regenerate kit content. Regenerating a section keeps edits elsewhere and preserves manually edited, pinned, or user-created questions and flashcards.
5. Practise questions and flashcards, record confidence, and track schedule progress.

## Architecture and implementation choices

- **Research sources:** the supplied company site and links discovered and ranked from its pages; its `robots.txt` rules are checked before crawling. Interview research uses Gemini's Google Search grounding when configured, Hacker News' Algolia API, and DuckDuckGo HTML results as a fallback. If no company-specific report is found, role-level reports are labeled separately. Search snippets are attributed to their result URLs; candidate reports are anecdotal, not a confirmed company hiring process. No job-board scraping is used.
- **Research safety:** pasted descriptions, search results, and fetched pages are untrusted evidence. The fetcher validates protocols and DNS results, blocks private and loopback hosts in normal operation, pins requests to resolved addresses, caps bytes, timeout, redirects and content types, and cleans page text. It uses a one-second crawl delay, page limits, and robots rules. Local fixture hosts are allowed only by the batch evaluation path.
- **Generation:** the pipeline separates research, requirements, company brief, topics, interview rounds, questions, flashcards, and scheduling. Technical, behavioral, system-design, and company-fit question categories are prompted independently. Output schemas are validated; malformed model output gets a repair attempt, and deterministic fallback content is marked for review instead of being presented as verified research.
- **Coverage:** application code compares requirement IDs with generated question references. It runs an initial pass and, only when must-have requirements are uncovered, one focused repair pass. Remaining gaps are recorded in the kit rather than hidden. This bounds provider calls and makes a thin job description produce a correspondingly thin kit.
- **Scheduling:** deterministic application code allocates questions and flashcards over exactly the requested number of days (1 to 60), in integer minutes. Must-have and harder material are prioritized earlier; this decision is not delegated to the model.
- **Editing and regeneration:** each kit has a monotonically increasing version for optimistic concurrency. Items carry generated, edited, pinned, or user origin. Regeneration replaces the selected generated content while preserving manual items and unrelated edits; replaced generated items are archived. Checkpoints let a worker resume completed generation sections after interruption.
- **Practice:** flashcard ratings use a simple confidence-weighted due interval (15 minutes, then 1, 2, 4, or 7 days for ratings 1 through 5). Answers, reveals, ratings, session status, and schedule completion persist per user and kit.
- **Rate limits and retries:** provider requests are serialized and spaced per provider across workers, responses are cached for 30 days, malformed output can be repaired, transient provider errors are retried, and quota-limited jobs are deferred until the reported cooldown instead of being marked complete.

See [backend/README.md](backend/README.md) for the service diagram, module map, data model, API responsibilities, security boundaries, and batch contract. See [frontend/README.md](frontend/README.md) for routes, components, state handling, and UI architecture.

## Configuration

| Variable | File / service | Purpose |
| --- | --- | --- |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | root `.env` / Compose | Local database initialization and credentials. |
| `DATABASE_URL` | `backend/.env` / API and worker | PostgreSQL connection; Compose overrides the hostname for its network. |
| `SESSION_SECRET` | `backend/.env` / API and worker | Signs session token digests; use at least 32 random characters. |
| `GEMINI_API_KEY`, `OPENAI_API_KEY` | `backend/.env` / API and worker | Configure at least one supported provider for generation. Gemini also provides grounded web search. |
| `LLM_MODEL`, `OPENAI_MODEL` | `backend/.env` / API and worker | Provider model names. |
| `LLM_MIN_REQUEST_INTERVAL_MS` | `backend/.env` / API and worker | Minimum interval between calls to one provider (default 5000 ms). |
| `FRONTEND_ORIGIN` | `backend/.env` / API | Comma-separated browser origins allowed by the API. |
| `BACKEND_INTERNAL_URL` | frontend process | Internal API proxy destination; set for Docker or production topology as needed. |
| `NEXT_PUBLIC_API_BASE_URL` | frontend build/runtime | Optional public API override; leave blank for same-origin `/api` proxying. |
| `MAX_DAYS`, `MAX_JD_CHARS`, `FETCH_TIMEOUT_MS`, `FETCH_MAX_BYTES`, `CRAWL_MAX_PAGES` | `backend/.env` | Input, research, and resource limits. |

Optional environment variables and defaults are listed in [backend/.env.example](backend/.env.example). The root [.env.example](.env.example) only contains local PostgreSQL settings. Production Compose expects `.env.production`; configure `APP_DOMAIN`, database credentials, `SESSION_SECRET`, and provider credentials there. Read [backend/README.md](backend/README.md#deployment) before deploying.

## Batch evaluation command

The required command runs the same pipeline used by the application:

```powershell
npm run evaluate -- --input backend/evals/jobs.json --output backend/evals/results.json
```

Input is a JSON array of `{ "id", "jd", "company_url", "days" }` cases. Output is version `1.0` and contains one `{ "id", "status", "kit", "error" }` entry per case. A case is `failed` only when a kit cannot be produced; partial research is `ok` with warnings and gaps in its kit. The runner continues through per-case failures, uses each input's `days`, and permits localhost fixture sites for assessment cases. It requires a reachable PostgreSQL database and provider credentials. The 15-case fixtures and deterministic review guidance are documented in [backend/evals/README.md](backend/evals/README.md).

## Development checks

```powershell
npm run test:unit --workspace backend
npm test --workspace frontend
```

PostgreSQL integration tests need a separate database whose name includes `test`; set `TEST_DATABASE_URL` to that database and run:

```powershell
npm run test:integration --workspace backend
```

Never point integration tests at a development or production database. LLM evaluations are separate from unit tests and use real provider calls; see [backend/evals/README.md](backend/evals/README.md).

## Deployment and further reading

- `docker-compose.production.yml` runs the application behind Caddy, with private PostgreSQL/API services and automatic HTTPS for a correctly configured public domain.
- `docker-compose.backend.yml` starts PostgreSQL, API, and worker.
- `docker-compose.frontend.yml` starts a frontend container pointing at a host API.
- `render.yaml` is a Render Blueprint for frontend, private API, worker, and PostgreSQL. It selects paid compute/database plans. Render does not offer free instances for private services or workers, and its free PostgreSQL expires after 30 days; review the current [plan details](https://render.com/docs/free) and [pricing](https://render.com/pricing) before deploying.

See [frontend/README.md](frontend/README.md), [backend/README.md](backend/README.md), and [backend/evals/README.md](backend/evals/README.md).
