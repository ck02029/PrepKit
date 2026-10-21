# PrepKit frontend

The frontend is a Next.js App Router application styled with Tailwind CSS. It presents the authenticated kit workspace, generation progress, editable kit sections, study schedules, and practice sessions. Shared kit types and runtime validation come from `packages/kit-schema`.

## Run locally

From the repository root, install workspace dependencies with `npm ci`. Configure PostgreSQL and the backend using the steps in the [root README](../README.md#quick-start). Start the API and worker, then run:

```powershell
npm run dev --workspace frontend
```

Visit [http://localhost:3000](http://localhost:3000). In development, the Next.js `/api/:path*` rewrite proxies to `http://localhost:8000`. No AI keys belong in the frontend. For an all-container setup, use `docker compose up --build -d` from the repository root.

Run the frontend unit tests from the root:

```powershell
npm test --workspace frontend
```

## Route map

| Route | Responsibility |
| --- | --- |
| `/register`, `/login` | Account creation and sign-in. |
| `/` | Authenticated dashboard. |
| `/kits` | Filterable list of the current user's kits and readiness states. |
| `/kits/[id]` | Kit builder and requirement/evidence coverage. |
| `/kits/[id]/practice` | Choose or resume practice. |
| `/kits/[id]/practice/session` | Work through one question or flashcard at a time. |
| `/kits/[id]/report` | Review session history and practice results. |
| `/kits/[id]/schedule` | Review the study plan and mark days complete. |
| `/new`, `/new/batch` | Create one kit or submit a batch of roles. |

The signed-in route group lives under `src/app/(app)`. Authentication pages are outside that group. API ownership checks remain authoritative; route protection in the frontend is a usability boundary, not the security boundary.

## Component and state organization

- `src/components/auth/` owns sign-in and registration forms.
- `src/components/generation/` owns single-kit and batch input plus long-running job progress and failure states.
- `src/components/kits/` owns kit listing, builder sections, inline editing, notes, readiness, coverage, and schedule views.
- `src/components/practice/` owns question and flashcard management, session flow, confidence capture, and reports.
- `src/components/layout/` provides the authenticated app shell, dashboard, and sign-out.
- `src/components/ui/` provides shared fields, buttons, dialogs, skeletons, badges, error and empty states, menus, and toasts.
- `src/lib/` contains API clients, shared frontend types, and pure UI/state helpers.

The UI separates editing from persistence: users can work with draft state and reorder content without a request for every keystroke. Saves send a kit version; if another request has already changed the kit, the API returns a version conflict so stale content does not silently overwrite newer data. Section regeneration is an explicit action and generation progress is polled separately from kit editing.

Questions, flashcards, and the company brief expose provenance/origin metadata. Category regeneration only replaces generated questions in the selected category. It retains questions marked edited, pinned, or user-created, and preserves edits in other categories. Schedule regeneration is isolated from the question and brief content.

## API and configuration

`src/lib/backend-api.ts` contains typed calls to the backend, and `src/lib/api.ts` provides the UI-facing API helpers. The browser uses relative `/api` paths, which Next.js rewrites to the backend. In local development the destination defaults to `http://localhost:8000`; in Compose it is `http://backend:8000`. For the Render free-tier Blueprint, configure `BACKEND_INTERNAL_URL` as the API service's public HTTPS URL. Render Free services cannot use private networking, so the frontend server makes that proxy request over HTTPS. The destination is provided at build time through the frontend service configuration. `NEXT_PUBLIC_API_BASE_URL` can point browser requests directly at a separately hosted API, but then the API must allow the frontend origin in `FRONTEND_ORIGIN`.

The backend owns cookie/session authentication. The frontend does not receive or store provider keys. See the [root README configuration table](../README.md#configuration) and [backend README](../backend/README.md) for service configuration and API behavior.

## Accessibility and responsive behavior

The application uses semantic form controls, visible labels, keyboard-operable buttons and dialogs, status/error feedback, and responsive layouts for laptop and phone widths. Shared loading, empty, and error states are under `src/components/ui/`; long generation work has per-stage progress and failure details in `src/components/generation/progress-view.tsx`.
