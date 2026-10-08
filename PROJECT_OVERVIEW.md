# HireCopilot Project Overview

## 1. Architecture at a Glance

HireCopilot is a React 19 hiring-operations prototype built with **TanStack Start**, **TanStack Router**, **TanStack Query**, **Supabase/Postgres**, Tailwind CSS, Radix-based UI primitives, and a Lovable AI Gateway.

The runtime is a full-stack TypeScript application:

```text
Browser React UI
    |
    | TanStack Router + React Query
    | Supabase publishable client for browser-safe queries and mutations
    v
Supabase PostgREST / PostgreSQL
    |
    +-- TanStack Start server functions
          |-- Copilot tool-calling workflow
          |-- Feedback AI/risk analysis
          |-- Conflict-safe interview booking
          |-- Supabase service-role reads for AI tools
          |-- Lovable AI Gateway
```

The current implementation is **not** the Express/Node/PostgreSQL structure proposed in the README. It uses TanStack Start server functions and Supabase instead of a separate Express API and `pg`/Prisma server.

## 2. Repository and Folder Structure

```text
hiring-ai-orchestrator/
├── public/                         Static public assets
│   └── robots.txt
├── src/
│   ├── router.tsx                  Creates the TanStack Router and QueryClient
│   ├── routeTree.gen.ts            Generated route tree; do not edit manually
│   ├── server.ts                   SSR fetch wrapper and catastrophic-error normalization
│   ├── start.ts                    TanStack Start middleware and server bootstrap
│   ├── styles.css                  Tailwind v4 theme, design tokens, dark mode, base styles
│   ├── routes/                     File-based page routes
│   │   ├── __root.tsx               Root HTML shell, providers, errors, 404, toaster
│   │   ├── index.tsx                Executive hiring dashboard
│   │   ├── open-positions.tsx       Position list, details, filters, and lifecycle actions
│   │   ├── candidates.tsx           Candidate table, filters, details, CRUD
│   │   ├── orchestrator.tsx         Interview scheduling workflow
│   │   ├── pipeline.tsx             Six-stage candidate Kanban
│   │   ├── copilot.tsx              Full-page Teams-style Copilot
│   │   ├── analytics.tsx            Funnel, source, and throughput visualizations
│   │   ├── reports.tsx              SLA/interview reporting and CSV export
│   │   └── configuration.tsx        SLA, automation, and interviewer configuration UI
│   ├── components/
│   │   ├── app-shell.tsx            Shared sidebar, header, navigation, Copilot launcher
│   │   ├── copilot-panel.tsx        Copilot chat UI and slide-over panel
│   │   ├── candidate-form-dialog.tsx Candidate create/edit and delete dialogs
│   │   ├── interviewer-form-dialog.tsx Interviewer create/edit dialog
│   │   ├── position-form-dialog.tsx Position create/edit, status, and delete dialogs
│   │   ├── department-form-dialog.tsx Department create/edit and delete dialogs
│   │   ├── reject-candidate-dialog.tsx Single/bulk candidate rejection with reason
│   │   ├── unreject-candidate-dialog.tsx Restore rejected candidates to the pipeline
│   │   ├── feedback-modal.tsx       Ten-question feedback and AI risk workflow
│   │   └── ui/                      Radix/shadcn-style reusable UI primitives
│   ├── hooks/
│   │   └── use-mobile.tsx           Mobile viewport helper
│   ├── lib/
│   │   ├── hiring.ts                Domain types, React Query definitions, helpers, activity logging
│   │   ├── copilot.functions.ts     Copilot server function, tools, and tool execution
│   │   ├── feedback.functions.ts    AI feedback analysis and deterministic fallback
│   │   ├── scheduling.functions.ts Conflict-safe interview booking server function
│   │   ├── ai.server.ts             Lovable AI Gateway Responses API client
│   │   ├── utils.ts                 cn() class-name utility
│   │   └── error*.ts                Error capture, reporting, and fallback HTML
│   ├── integrations/supabase/
│   │   ├── client.ts                Browser Supabase client using publishable key
│   │   ├── client.server.ts         Server-only service-role Supabase client
│   │   ├── types.ts                 Generated database TypeScript types
│   │   ├── auth-attacher.ts         Auth token attachment for server functions
│   │   ├── auth-middleware.ts       Authentication middleware support
│   │   ├── cron-auth.ts              Cron authentication helper
│   │   └── previewAuthStorage.ts    Lovable preview session storage
│   └── ...
├── supabase/
│   ├── config.toml                  Local Supabase configuration
│   └── migrations/                  Base schema plus scheduling, position, and rejection changes
├── package.json                      Scripts and dependency manifest
├── package-lock.json                 npm dependency lockfile
├── vite.config.ts                   Vite/TanStack Start/Nitro configuration
├── tsconfig.json                    TypeScript configuration and @ path alias
├── eslint.config.js                 ESLint 9 configuration
├── components.json                  UI generator configuration
├── README.md                         Original product brief and Lovable notes
├── roadmap.md                        Product roadmap and implementation status
├── LOCAL-SETUP.md                    Local application and Supabase setup
├── SETUP-OWN-SUPABASE.md             Bring-your-own Supabase instructions
└── supabase-setup.sql                Standalone Supabase bootstrap SQL
```

## 3. Key Dependencies

### Application and runtime

- `react`, `react-dom`: React 19 UI rendering.
- `@tanstack/react-start`: SSR, server functions, middleware, and the application runtime.
- `@tanstack/react-router`, `@tanstack/router-plugin`: Type-safe file-based routing and generated route metadata.
- `vite`, `nitro`, `@vitejs/plugin-react`: Development server, bundling, and deployment runtime.
- `vite-tsconfig-paths`: Supports imports using the `@/` source alias.

### Data and backend integration

- `@tanstack/react-query`: Server-state cache, query lifecycle, invalidation, and the shared `QueryClient`.
- `@supabase/supabase-js`: Browser and server access to Supabase Postgres through PostgREST, plus auth/session support.
- `@lovable.dev/vite-tanstack-config`: Lovable's TanStack/Vite integration configuration.

There is no Express, `pg`, Prisma, or separate REST API package in the current implementation.

### AI and forms

- `react-hook-form`, `@hookform/resolvers`, `zod`: Form state and validation. Candidate forms use Zod directly; the dependency set also supports resolver-based forms.
- The AI integration is implemented with native `fetch` in `src/lib/ai.server.ts`, not a provider SDK. It calls the Lovable AI Gateway with `openai/gpt-6-astra`.

The newly added position, department, rejection, and scheduling features use existing dependencies; `package.json` adds no new runtime package for them. In particular, the application still has no Groq SDK, Express server, ORM, or global state-store dependency.

### UI, styling, and visualization

- `tailwindcss`, `@tailwindcss/vite`, `tw-animate-css`: Utility styling, theme tokens, and animations.
- `@radix-ui/*`: Accessible primitives behind the shadcn-style components in `src/components/ui`.
- `class-variance-authority`, `clsx`, `tailwind-merge`: Component variants and class-name composition.
- `lucide-react`: Icons.
- `recharts`: Analytics charts.
- `sonner`: Toast notifications.
- `date-fns`, `react-day-picker`: Date utilities and calendar support.
- `cmdk`, `embla-carousel-react`, `input-otp`, `react-resizable-panels`, `vaul`: Supporting UI primitives available to the component library.

### Development

- `typescript`, `@types/*`: Type checking.
- `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `prettier`: Linting and formatting.

## 4. State Management

The project has no Redux, Zustand, or other global client store. State is split into three layers:

### Server state: TanStack Query

`src/lib/hiring.ts` centralizes `queryOptions` definitions backed by Supabase:

- `candidatesQuery`: Candidates joined to job title, department, and location.
- `departmentsQuery`: Departments ordered by name for position filters and configuration.
- `jobsQuery`: Positions joined to their department, ordered newest first.
- `interviewersQuery`: Interview panel members.
- `interviewsQuery`: Interviews joined to candidates, interviewers, and position metadata.
- `feedbackQuery`: Feedback joined to interview and candidate information.
- `activityQuery(candidateId)`: Candidate activity, conditionally enabled for a selected candidate.

Routes call `useQuery(...)`. Browser-safe mutations use the Supabase publishable client directly, then invalidate the affected keys with `queryClient.invalidateQueries(...)`. Examples include candidate/position/department CRUD, position status changes, candidate rejection/restoration, feedback persistence, and activity logging.

Interview booking is the important exception: the orchestrator calls the `bookInterview` TanStack Start server function with `useServerFn`. That function uses the service-role Supabase client to validate and write the complete booking before the UI invalidates cached queries.

### Local UI state: React hooks

`useState`, `useMemo`, and `useEffect` manage transient concerns such as filters, selected rows, bulk-selection sets, dialog visibility, wizard steps, selected slots/panels, Copilot messages, loading flags, and feedback scores. Examples include candidate bulk rejection state, open-position filters/details, the four-step booking state in `orchestrator.tsx`, and chat history in `copilot-panel.tsx`.

### Form state and validation

Candidate, interviewer, position, and department dialogs maintain local form objects and validate with Zod before writing. Rejection/restoration dialogs keep their reason or destination stage locally. The feedback modal stores ten numeric rubric scores plus written notes and calculates a live average locally.

## 5. Routing Structure

TanStack Router is initialized in `src/router.tsx` with the generated `routeTree` and a fresh `QueryClient`. The root route in `src/routes/__root.tsx` provides:

- The HTML document shell with `HeadContent` and `Scripts`.
- `QueryClientProvider` around all nested routes.
- Global `Toaster` notifications.
- 404 and error boundary components.

All application pages are direct children of the root route:

| URL | File | Responsibility |
|---|---|---|
| `/` | `routes/index.tsx` | Executive dashboard, KPIs, SLA priorities, today's interviews, pipeline funnel |
| `/open-positions` | `routes/open-positions.tsx` | Search/filter positions, inspect linked candidates/interviews, and create/edit/close/reopen/delete roles |
| `/candidates` | `routes/candidates.tsx` | Search/filter candidates, inspect details/activity, add/edit/delete records |
| `/orchestrator` | `routes/orchestrator.tsx` | Select candidate, choose slot/panel/round, book interview, log reminders |
| `/pipeline` | `routes/pipeline.tsx` | Kanban columns for `SCREENING`, `L1`, `L2`, `L3`, `OFFER`, `REJECTED` |
| `/copilot` | `routes/copilot.tsx` | Full-page conversational Copilot |
| `/analytics` | `routes/analytics.tsx` | Hiring funnel and operational charts |
| `/reports` | `routes/reports.tsx` | SLA breaches, interview activity, and exportable report data |
| `/configuration` | `routes/configuration.tsx` | SLA/automation controls plus department and interviewer management |

The orchestrator accepts the typed search parameter `candidateId`, allowing dashboard, pipeline, and open-position actions to deep-link to a specific candidate. The sidebar navigation is defined once in `src/components/app-shell.tsx`; active links are derived from the current pathname and include all nine page routes.

## 6. Core Components and Data Flow

### Shared application shell

`AppShell` owns the desktop sidebar, header, page title/subtitle, navigation, notification button, Copilot launch controls, and global toaster. It keeps the slide-over's `copilotOpen` state locally and renders page-specific content through `children`.

### Executive dashboard

`index.tsx` loads candidates, interviews, jobs, and feedback with React Query. It computes today's interviews, offers, high-risk feedback, stage counts, and active candidates over the three-day SLA. Some KPI values have demo fallbacks: open positions (`156`), average hiring cycle (`23 days`), and fallback counts when live data is empty.

### Open positions and departments

`open-positions.tsx` loads jobs, departments, candidates, and interviews. It filters roles by search text, `OPEN`/`CLOSED` status, and department; derives position-level pipeline counts; and shows linked candidates with their latest or upcoming interview. Candidate actions deep-link into the orchestrator.

`PositionFormDialog` creates new positions through the `create_job_with_code` Supabase RPC so job codes are generated in the database. Edits preserve the existing code. `PositionStatusDialog` closes or reopens a role, while `DeletePositionDialog` permits deletion only when no candidate or interview references it. These operations invalidate jobs and related candidate/interview data.

`configuration.tsx` uses `DepartmentFormDialog` and `DeleteDepartmentDialog` to persist department names/codes in Supabase and display each department's position count. Department codes are normalized and validated as two to six uppercase alphanumeric characters. A department cannot be deleted while positions reference it; renaming one also updates the denormalized `jobs.department` value.

### Candidate management

`candidates.tsx` loads candidates, interviews, and selected-candidate activity. It filters by search text, stage, risk, recency, offers, and rejected status. Selecting a row opens a detail panel with job/contact data, skills, interview state, rejection reason, and activity history.

`CandidateFormDialog` validates and writes candidate data, updates `status_updated_at` on stage changes, and logs `APPLICATION_RECEIVED` or `STAGE_CHANGED`. `DeleteCandidateDialog` removes related feedback, interviews, and activity before deleting the candidate, then invalidates relevant queries.

Active candidate rows support single or bulk selection. `RejectCandidateDialog` requires a reason and calls `rejectCandidate` or `rejectCandidates`, which sets `current_stage` to `REJECTED`, stores `rejection_reason`, refreshes the stage timestamp, and logs `STAGE_CHANGED`. The Rejected tab exposes `UnrejectCandidateDialog`; restoring a candidate clears the reason, moves the candidate to a chosen non-rejected stage, updates the timestamp, and logs the transition. Rejection does not automatically cancel existing interviews.

### Pipeline

`pipeline.tsx` reads candidates and interviews, groups candidates into six stage columns, calculates `daysInStage`, and classifies SLA status with `slaLevel`:

- `ok`: up to three days.
- `warning`: more than three and up to five days.
- `breach`: more than five days.

Each card links to the orchestrator and can open feedback when an interview exists.

### Interview orchestrator

`orchestrator.tsx` implements candidate selection, round selection, slot selection, panel ranking, booking, and reminders. Panel ranking is calculated from candidate/interviewer skill overlap and scheduled interviewer load. Rejected candidates are excluded from the default active list.

Booking calls the `bookInterview` server function. It rejects an empty panel or past slot, checks both candidate and interviewer overlaps, creates a shared `booking_group_id` for all panel rows, inserts the interviews, advances the candidate stage, updates its timestamp, and logs `INTERVIEW_SCHEDULED`. It returns a structured success/failure result so the route can show conflict-specific errors; successful bookings invalidate cached data. Database exclusion constraints provide a second line of defense against concurrent booking races.

The reminder action currently logs `REMINDERS_SENT`; it does not call Microsoft Teams or email APIs.

The available slots and availability scores are generated locally by `nextSlots()`, so slot discovery is simulated rather than connected to external calendars.

### Copilot chat

`CopilotChat` maintains the visible conversation and calls the TanStack Start `askCopilot` server function through `useServerFn`. It supports preset questions, markdown-like rendering, loading/error states, and badges showing which tools were used. `CopilotPanel` wraps the same chat in a Radix Sheet for the global slide-over.

On the server, `askCopilot`:

1. Keeps the latest conversation turns.
2. Sends them to the Lovable AI Gateway with four strict tools.
3. Executes requested tools against the server-only Supabase client.
4. Adds tool results back to the model context.
5. Repeats for up to five tool-call rounds.
6. Returns the final reply and tool names used.

The available tools are `getCandidateStatus`, `getStuckCandidates`, `getPipelineSummary`, and `getTodaysInterviews`. The system prompt instructs the model to use live data, flag SLA breaches, stay concise, and recommend a next action.

### Feedback and risk analysis

`FeedbackModal` presents ten JD-aligned sliders, notes, a live average, and projected risk. On submit it calls the server-side `analyzeFeedback` function. The function asks the AI gateway for strict JSON containing score, risk, rationale, recommendation, sentiment, strengths, and concerns. If the AI call fails, it deterministically computes the average and variance and assigns risk/recommendation thresholds.

After analysis, the modal writes `interview_feedback`, marks the interview `COMPLETED`, logs `FEEDBACK_SUBMITTED`, invalidates queries, and shows a toast.

## 7. Database and Server Boundaries

The migrations define seven Postgres tables:

- `departments`: unique department names and two-to-six-character uppercase alphanumeric codes.
- `jobs`: recruiter-facing `job_code`, department relation/name, role details, location, skills, dates, and `OPEN`/`CLOSED` status.
- `interviewers`: panel members, titles, skills, and time zones.
- `candidates`: applicant identity, job relation, skills, stage, stage timestamp, and optional rejection reason.
- `interviews`: candidate/interviewer/job relations, booking group, round, schedule, meeting link, and status.
- `interview_feedback`: decision, numeric score, rubric JSON, comments, risk, and rationale.
- `candidate_activity_log`: auditable candidate actions and JSON details.

The base migration seeds demo jobs, interviewers, candidates, interviews, feedback, and activity events. Follow-up migrations add:

- `booking_group_id`, valid time/status checks, and GiST exclusion constraints that prevent overlapping scheduled interviews for candidates and interviewers while allowing multiple panel rows in one booking group.
- The `departments` table, `jobs.department_id`, unique generated `jobs.job_code`, position status checks, and indexes for job codes, departments, statuses, and job foreign keys.
- The `create_job_with_code(...)` security-definer function, which generates codes as two-digit year + five-digit yearly sequence + department code.
- `candidates.rejection_reason` for persisted rejection context.

The demo RLS model still grants broad `anon` and `authenticated` CRUD access, now including departments and the job-code RPC. `client.ts` lazily creates the browser Supabase client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. `client.server.ts` lazily creates a service-role client from `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; it must remain server-only. `start.ts` attaches Supabase auth to server functions and applies error and CSRF middleware.

## 8. AI and Error Handling

`ai.server.ts` is a streaming, dependency-free Responses API client. It sends `LOVABLE_API_KEY` server-side, parses streamed text/tool output, reports common rate-limit/credit errors, and returns final text plus raw output items.

The root route reports render errors, while `start.ts` and `server.ts` normalize server/SSR failures into an HTML error page. `error-capture.ts` preserves errors that the underlying h3 runtime may otherwise turn into generic JSON responses.

## 9. Prototype Caveats and Operational Notes

- The README describes a planned PERN/Express/Groq architecture; the checked-in code implements TanStack Start, Supabase, and the Lovable AI Gateway instead.
- Several dashboard values are static or fallback demo values rather than fully aggregated database metrics.
- Interview slot discovery and calendar availability are simulated locally.
- Reminder delivery only writes an activity-log event; external Teams/email delivery is not implemented.
- Daily interview and open-position emails can use the free Google Apps Script Gmail integration, with independent recipients/schedules and CSV attachments. Open positions supports daily/weekly triggers; interview activity is daily. Both require one-time script deployment and server-side webhook configuration but no verified domain. CSV download remains available directly from Reports.
- SLA thresholds and automation toggles remain local UI state; departments and interviewers are persisted in Supabase.
- RLS policies in the migration grant broad `anon` and `authenticated` access for the demo. Production deployment needs real authentication and user/organization-scoped policies.
- The service-role Supabase client bypasses RLS and must only be imported in server-side code.
- The repository defines lint, build, development, preview, and formatting scripts, but no automated test script is currently listed in `package.json`.

## 10. Local Commands

```sh
npm install
npm run dev       # Start Vite/TanStack Start development server
npm run build     # Production build
npm run preview   # Preview the production build
npm run lint      # ESLint
npm run format    # Prettier
```

The application requires Supabase client variables for browser queries and server variables for service-role and AI features. The exact environment variable names are enforced by the lazy client constructors and `ai.server.ts`.
