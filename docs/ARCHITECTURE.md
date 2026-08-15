# Architecture

`agent-dashboard` is a **local cockpit dashboard** for an autonomous agent. It
is a single Node.js process that serves a static SPA (`index.html` +
`styles.css` + `app.js`) and exposes a small JSON API that adapts on-disk agent
data (JSONL telemetry, SQLite traces/tasks, markdown vault files) into a
shape the UI can render.

```
┌────────────────────────────────────────────────────────────────────┐
│  Browser (SPA)                                                      │
│  index.html + styles.css + app.js                                   │
│  views: dashboard · kanban · plans · projects · skills              │
└───────────────▲────────────────────────────────────────────────────┘
                │  JSON + static files
┌───────────────┴────────────────────────────────────────────────────┐
│  server.js (Node, no dependencies)                                 │
│                                                                     │
│  • static file server (GET /)                                      │
│  • optional Basic/session auth (DASHBOARD_AUTH)                    │
│  • REST adapters  →  /api/*                                        │
│  • reads/writes agent data under AGENT_ROOT                        │
└───────┬──────────────┬──────────────┬──────────────┬───────────────┘
        │              │              │              │
        ▼              ▼              ▼              ▼
   JSONL logs      SQLite DBs     Markdown vault    Project folders
   usage.jsonl     traces.db      obsidian-vault/   projects/<id>/
   dialog.jsonl    tasks.db        agent/skills/     config.yml, *.md
   pipeline-*.json work-items.db
```

## Static UI

`app.js` is a dependency-free vanilla-JS SPA. On load it calls
`/api/dashboard/summary` and falls back to bundled mock data when the API is
unavailable (so the UI always renders something). Navigation is a simple
view-switcher (`?view=dashboard|kanban|plans|projects|skills`).

## HTTP API

### Dashboard

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/dashboard/summary` | Full operational snapshot: health, pipeline, doctor, usage/tokens, traces, events, memory analysis, kanban, turns. Returns `live: true` even without agent data (zeroed/stub fallback). |

### Plans

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/plans` | List markdown plans from the plans dir (`AGENT_PLANS_DIR`). |
| `POST` | `/api/plans/update` | Overwrite a plan's markdown content. |

### Skills

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/skills` | List skills from `AGENT_SKILLS_DIR` (folders with `SKILL.md` or flat `.md`). |
| `POST` | `/api/skills/update` | Overwrite a skill's markdown content. |

### Projects

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/projects` | List projects from `AGENT_PROJECTS_DIR` (config.yml, key files, curator, metrics). |
| `POST` | `/api/projects/tov/update` | Overwrite a project's `tone-of-voice.md`. |

### Tasks (kanban)

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/tasks` | List tasks from the tasks DB (`AGENT_TASKS_DB`). |
| `POST` | `/api/tasks/update` | Update a task (title, description, status, tags, project, …). |
| `POST` | `/api/tasks/move` | Move a task between kanban columns. |
| `POST` | `/api/pipeline/:id/:action` | Static pipeline contract (mock): `plan|implement|review|accept`. |

### Auth

| Method | Path | Description |
| --- | --- | --- |
| `GET`/`POST` | `/login` | Login form + session cookie (only when `DASHBOARD_AUTH` is on). |
| `POST` | `/logout` | Clear the session cookie. |

## Data sources

Paths are resolved against `AGENT_ROOT` (env), with a per-concern override env
variable when available. Every reader degrades gracefully — if a file/db is
missing it contributes `0` / `missing` / `[]` rather than crashing.

| Concern | Source | Env override |
| --- | --- | --- |
| Health | `health/health.status` | `HEALTH_STATUS_PATH` |
| Pipeline | `data/pipeline-status.json` | — |
| Doctor | `data/doctor-status.json` | `DOCTOR_STATUS_PATH` |
| Usage / tokens | `data/usage.jsonl` | — |
| Traces | `traces.db` (SQLite, `node:sqlite`) | `AGENT_TRACE_DB`, `AGENT_DATA_DIR` |
| Tasks | `data/tasks.db` | `TASKS_DB_PATH`, `AGENT_TASKS_DB` |
| Dialog | `sessions/*/dialog.jsonl` | — |
| Context footprint | `data/context-footprint.jsonl` | — |
| Plans | `projects/<id>/plans` | `AGENT_PLANS_DIR` |
| Skills | `agent/skills` | `AGENT_SKILLS_DIR` |
| Projects | `obsidian-vault/projects` | `AGENT_PROJECTS_DIR` |
| Memory (vault) | `obsidian-vault` | `ASSISTANT_VAULT_DIR` |
| Guards | `guards/index.json` | — |

## UI layers

The dashboard is organized into seven bands (01–07): **System Status**
(passport, KPIs, verdict, freshness), **Conversation** (last turn + dialog),
**Turns** (run/turn history), **Memory** (core size, vault quality, analysis),
**Tools** (pipeline steps, diagnostics), **Ops** (attention, shift summary,
guards, errors), and **Live** (SSE-style event feed with filter legend).
The kanban/plans/projects/skills pages are separate views with edit modals
that write back through the `POST` endpoints above.

## Security notes

- Auth is opt-in (`DASHBOARD_AUTH` defaults to `on`); set `DASHBOARD_PASSWORD`
  or `DASHBOARD_PASSWORD_HASH` for production. The built-in dev default
  (`admin` / `change-me`) is for local development only.
- All write endpoints validate and confine paths (`safePlanPath`,
  `safeSkillPath`, `safeProjectTovPath`) to their configured roots.
- The dashboard writes real markdown/task data — do not expose it publicly
  without auth.
