# PrepKit

PrepKit turns a job description into a researched interview preparation kit. It combines a Next.js and Tailwind interface, a Node.js and Express API, PostgreSQL, and a durable background job queue. In local Compose and production Compose, the API and worker run as separate services; the Render free-tier demo runs the API and worker loop together in one web service. It supports account-based kits, batch creation, section editing and regeneration, practice sessions, flashcards, and a day-by-day schedule.

This repository uses PostgreSQL rather than the assessment's preferred MongoDB. PostgreSQL transactions and foreign keys fit ownership checks, durable job processing, and practice history; JSONB stores the versioned kit document while indexed relational tables support querying and progress. TypeScript is used across the stack, and the shared kit contract is in `packages/kit-schema`.

## Demo links

- **Live app (Render):** [Live Link](https://prepkit-frontend-ik74.onrender.com) 
- **Video walkthrough:** [Vedio Link](https://drive.google.com/file/d/1cVTz6Xmn5q8fVchdm5t-OeMfDYf8A1oe/view?usp=sharing)

## Quick start

### Docker Compose

Requirements: Docker Desktop (or Docker Engine with Compose), and an AI provider key for generation.

Create local environment files from the tracked templates:

```powershell
Copy-Item .env.example .env
Copy-Item backend/.env.example backend/.env
```

Edit `.env` and `backend/.env`: set a long random database password in the first file, use that same password in `DATABASE_URL` in the second, replace `SESSION_SECRET` with at least 32 random characters, and set either a single provider key or its comma-separated key pool. Keep these local files private; they are ignored by Git.

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
- **Research safety:** pasted descriptions, search results, and fetched pages are untrusted evidence. The fetcher validates protocols and DNS results, blocks private and loopback hosts in normal operation, pins requests to resolved addresses, caps bytes, timeout, redirects and content types, and cleans page text. It uses a short crawl delay, four company pages by default, and robots rules. Local fixture hosts are allowed only by the batch evaluation path.
- **Generation:** the pipeline separates research, requirements, company brief, topics, interview rounds, questions, flashcards, and scheduling. Technical, behavioral, system-design, and company-fit questions are generated concurrently in separate category-specific requests, with requirements scoped to the matching category. Output schemas are validated; provider requests have a 20-second timeout and one attempt per provider, and deterministic fallback content is marked for review instead of being presented as verified research. Backend logs include per-stage and per-provider elapsed times.
- **Coverage:** application code compares requirement IDs with generated question references. It runs an initial set of category-specific requests and, only when must-have requirements remain uncovered, one focused repair pass for those requirement IDs. Remaining gaps are recorded in the kit rather than hidden. This bounds provider calls and makes a thin job description produce a correspondingly thin kit.
- **Scheduling:** deterministic application code allocates questions and flashcards over exactly the requested number of days (1 to 60), in integer minutes. Must-have and harder material are prioritized earlier; this decision is not delegated to the model.
- **Editing and regeneration:** each kit has a monotonically increasing version for optimistic concurrency. Items carry generated, edited, pinned, or user origin. Regeneration replaces the selected generated content while preserving manual items and unrelated edits; replaced generated items are archived. Checkpoints let a worker resume completed generation sections after interruption.
- **Practice:** flashcard ratings use a simple confidence-weighted due interval (15 minutes, then 1, 2, 4, or 7 days for ratings 1 through 5). Answers, reveals, ratings, session status, and schedule completion persist per user and kit.
- **Rate limits and retries:** multiple Gemini, Groq, and OpenAI keys can be configured as comma-separated `GEMINI_API_KEYS`, `GROQ_API_KEYS`, and `OPENAI_API_KEYS`. Keys are tried least-used first within each provider, Gemini then Groq then OpenAI; each key has its own daily call budget, cooldown, and request pacing slot. Groq provides an OpenAI-compatible endpoint and can be used with its free-tier API key, subject to model-specific limits. Gemini quotas are project-scoped, so keys intended to add capacity must come from separate Google Cloud projects. Set `LLM_DAILY_CALLS_PER_KEY` to about 80% of the daily limit shown for the model and project in AI Studio; limits vary by project and model. The default of 150 is only a configuration placeholder and may be higher than your actual provider allowance. Successful generation outputs are cached for 30 days; company homepage discovery is cached for 30 days and interview research for 7 days. Empty research results are not cached. Quota-limited jobs are deferred until the earliest key cooldown expires.
- **Render free deployment:** `render.yaml` uses two free web services and a free PostgreSQL database. On Render only, the backend web service runs both the API and queue worker in one process; the regular Compose deployment still runs them separately. The frontend proxies to the API's public HTTPS URL because free services cannot receive private-network requests.

See [backend/README.md](backend/README.md) for the service diagram, module map, data model, API responsibilities, security boundaries, and batch contract. See [frontend/README.md](frontend/README.md) for routes, components, state handling, and UI architecture.

## Configuration

| Variable | File / service | Purpose |
| --- | --- | --- |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | root `.env` / Compose | Local database initialization and credentials. |
| `DATABASE_URL` | `backend/.env` / API and worker | PostgreSQL connection; Compose overrides the hostname for its network. |
| `SESSION_SECRET` | `backend/.env` / API and worker | Signs session token digests; use at least 32 random characters. |
| `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENAI_API_KEY` | `backend/.env` / API and worker | Optional single-key provider settings. Gemini also provides grounded web search. |
| `GEMINI_API_KEYS`, `GROQ_API_KEYS`, `OPENAI_API_KEYS` | `backend/.env` / API and worker | Optional comma-separated key pools. Gemini keys that should provide separate quota capacity must belong to separate Google Cloud projects. |
| `LLM_MODEL`, `GROQ_MODEL`, `OPENAI_MODEL` | `backend/.env` / API and worker | Provider model names. |
| `AI_FREE_ONLY` | `backend/.env` / API and worker | When `true`, excludes OpenAI from generation fallbacks. |
| `LLM_DAILY_CALLS_PER_KEY` | `backend/.env` / API and worker | Application-side daily call cap per key (default 150); adjust to approximately 80% of the provider's actual daily quota. Gemini daily accounting resets at Pacific midnight; OpenAI at UTC midnight. |
| `LLM_MIN_REQUEST_INTERVAL_MS`, `LLM_MAX_OUTPUT_TOKENS`, `MAX_QUESTIONS_PER_CATEGORY` | `backend/.env` / API and worker | Per-key pacing (default 5000 ms), output token cap (8192), and per-category question cap (6). |
| `MAX_KITS_PER_DAY`, `REGENERATIONS_PER_HOUR` | `backend/.env` / API | Abuse limits (defaults 10 kits per rolling 24 hours and 6 retries/regenerations per hour). |
| `FRONTEND_ORIGIN` | `backend/.env` / API | Comma-separated browser origins allowed by the API. |
| `BACKEND_INTERNAL_URL` | frontend build/runtime | Next.js `/api` rewrite destination: `http://backend:8000` in Compose and the API's public HTTPS URL on Render Free. |
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
- `render.yaml` is a Render Blueprint for a free-tier demo deployment. The free web services can spin down after inactivity, use monthly included instance hours, and the free PostgreSQL database expires after 30 days. This is suitable for a temporary assessment demo, not durable production use. Review Render's current [free-tier limits](https://render.com/docs/free) before deploying.

See [frontend/README.md](frontend/README.md), [backend/README.md](backend/README.md), and [backend/evals/README.md](backend/evals/README.md).
