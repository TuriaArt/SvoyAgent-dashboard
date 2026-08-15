# Agent Dashboard

![version](https://img.shields.io/badge/version-1.0.0-blue)
![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![license](https://img.shields.io/badge/license-MIT-green)
![deps](https://img.shields.io/badge/dependencies-0-lightgrey)

A local **cockpit dashboard** for an autonomous agent. One Node.js process
serves a dependency-free web UI plus a small JSON API that turns on-disk agent
telemetry (JSONL logs, SQLite traces/tasks, markdown vault files) into an
operational overview — and degrades gracefully to neutral placeholders when no
agent data is present.

## Features

- **Operational telemetry** — health, pipeline, doctor, usage/token KPIs.
- **Task kanban** — drag-and-drop board with edit modal and column routing.
- **Project vault navigator** — browse projects, curators, and `tone-of-voice.md`.
- **Plans library** — markdown plans with status/horizon filters and editor.
- **Skills library** — skill folders (`SKILL.md`) with markdown editor.
- **Live SSE stream** — typed event feed with filter legend and replay.
- **Memory analysis** — core size, vault quality, broken links, summaries.
- **Ops / attention panel** — shift summary, guards, errors, work items.

![IVA Dashboard](assets/iva-dashboard-cover.png)

## Quick start

No build step, no dependencies.

```bash
git clone <your-repo-url> agent-dashboard
cd agent-dashboard

PORT=3001 DASHBOARD_AUTH=off node server.js
# → http://127.0.0.1:3001/
```

Direct view URLs:

```text
http://127.0.0.1:3001/?view=dashboard
http://127.0.0.1:3001/?view=kanban
http://127.0.0.1:3001/?view=plans
http://127.0.0.1:3001/?view=projects
http://127.0.0.1:3001/?view=skills
```

## Deployment guide (for AI agents)

This section is for an **AI agent** that received this repository as a link and
is asked to deploy it on the user's host. Read [`AGENTS.md`](AGENTS.md) first —
it is the rulebook (no personal data, no hardcoded paths, neutral entities).
The sequence below takes you from a bare URL to a running, verified instance.

### 1. Fetch and verify

```bash
git clone <repository-url> agent-dashboard
cd agent-dashboard

node --check server.js
node --check app.js
# no build step, no npm install required
```

### 2. Smoke run without data

Start on a random port with auth off and confirm the boilerplate responds:

```bash
PORT=3999 DASHBOARD_AUTH=off node server.js &
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3999/                        # 200
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3999/api/dashboard/summary  # 200
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3999/api/tasks               # 200
kill %1
```

With no agent data the summary returns `live: true` and neutral placeholder
values — that is expected.

### 3. Point at the agent's data (recommended)

The dashboard is only useful when it reads the agent's on-disk telemetry.
Ask the user for the paths, then export them:

```bash
export AGENT_ROOT=/path/to/agent
export AGENT_TRACE_DB=/path/to/agent/.agent/traces.db   # traces + tasks
export AGENT_PLANS_DIR=/path/to/agent/projects/one/plans
export AGENT_SKILLS_DIR=/path/to/agent/agent/skills
export AGENT_PROJECTS_DIR=/path/to/agent/obsidian-vault/projects
export ASSISTANT_VAULT_DIR=/path/to/agent/obsidian-vault/projects/one
```

If the user has no such paths yet, skip this step — the dashboard still runs on
placeholders. Every `AGENT_*` var accepts an `IVA_*` legacy alias. Full list:
see Configuration below.

### 4. Enable auth

Never expose the dashboard publicly without auth. Prefer a hash:

```bash
export DASHBOARD_AUTH=on
export DASHBOARD_USER=admin
export DASHBOARD_PASSWORD_HASH=$(echo -n 'choose-a-strong-password' | sha256sum | cut -d' ' -f1)
```

If the dashboard stays on localhost only, `DASHBOARD_AUTH=off` is acceptable
for a personal setup.

### 5. Run as a background service

**Option A — systemd user unit (recommended on Linux):**

```ini
# ~/.config/systemd/user/agent-dashboard.service
[Unit]
Description=Agent Dashboard
After=network.target

[Service]
WorkingDirectory=/path/to/agent-dashboard
Environment=PORT=3001
Environment=DASHBOARD_AUTH=on
Environment=DASHBOARD_USER=admin
Environment=DASHBOARD_PASSWORD_HASH=<hash>
Environment=AGENT_ROOT=/path/to/agent
ExecStart=/usr/bin/node server.js
Restart=on-failure

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now agent-dashboard.service
systemctl --user status agent-dashboard.service
```

**Option B — nohup (simple hosts):**

```bash
nohup env PORT=3001 DASHBOARD_AUTH=on DASHBOARD_USER=admin \
  DASHBOARD_PASSWORD_HASH=<hash> AGENT_ROOT=/path/to/agent \
  node server.js >> /var/log/agent-dashboard.log 2>&1 &
```

### 6. Verify the deployment

```bash
curl -s http://127.0.0.1:3001/api/dashboard/summary   # JSON, live:true
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3001/   # 200
```

With auth on, `GET /` should redirect to `/login`. For remote access put the
dashboard behind a reverse proxy with HTTPS (nginx/caddy/traefik) — do not
expose port 3001 directly.

### 7. Report back

Tell the user: the URL it runs on, which auth is enabled, which data sources
are connected (or that it runs on placeholders), and how to stop it
(`systemctl --user stop agent-dashboard.service` or `kill <pid>`).

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3001` | HTTP port. |
| `HOST` | `127.0.0.1` | Bind address. |
| `AGENT_ROOT` | `./agent-data` | Root of the agent data (`IVA_ROOT` also accepted). |
| `AGENT_DATA_DIR` | `<AGENT_ROOT>/data` | JSONL/status files directory. |
| `AGENT_TRACE_DB` | — | SQLite trace database path. |
| `AGENT_TASKS_DB` | — | SQLite tasks database path. |
| `AGENT_PLANS_DIR` | `<AGENT_ROOT>/projects/one/plans` | Plans directory. |
| `AGENT_SKILLS_DIR` | `<AGENT_ROOT>/agent/skills` | Skills directory. |
| `AGENT_PROJECTS_DIR` | `<AGENT_ROOT>/obsidian-vault/projects` | Projects directory. |
| `PROJECTS_ROOT` | — | Override for project contexts. |
| `ASSISTANT_VAULT_DIR` | — | Memory/vault directory. |
| `HEALTH_STATUS_PATH` | `<AGENT_ROOT>/health/health.status` | Health status file. |
| `DOCTOR_STATUS_PATH` | `<AGENT_ROOT>/data/doctor-status.json` | Doctor status file. |
| `DASHBOARD_AUTH` | `on` | Set to `off` to disable login. |
| `DASHBOARD_USER` | `admin` | Login user (dev default). |
| `DASHBOARD_PASSWORD` | `change-me` | Login password (dev default). |
| `DASHBOARD_PASSWORD_HASH` | — | SHA-256 hash (preferred over plaintext). |
| `DASHBOARD_SESSION_TOKEN` | — | Pre-shared session token. |

## Architecture

```
Browser SPA (index.html / app.js)
        │  JSON + static files
        ▼
server.js ── static serving · optional auth · /api/* adapters
        │
        ├── JSONL logs   (usage.jsonl, dialog.jsonl, pipeline/doctor status)
        ├── SQLite       (traces.db, tasks.db, work-items.db)  [node:sqlite]
        └── Markdown     (obsidian-vault, projects/<id>, agent/skills)
```

Full details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Repository structure

```text
.
├── server.js            # static server + JSON API + auth
├── index.html           # page structure & modals
├── styles.css           # cockpit UI styling
├── app.js               # SPA state, rendering, filters, save handlers
├── package.json
├── tsconfig.json        # type-checks the self-contained core modules
├── AGENTS.md            # rules + deploy guide for AI agents
├── src/core/            # agent pre-model pipeline reference (TypeScript)
│   ├── events.ts        # typed event bus
│   ├── event-stream.ts  # SSE stream with ring-buffer replay
│   ├── invariant.ts     # assertion helper
│   ├── supervisor.ts    # pipeline orchestrator (reference)
│   └── …                # classifier, preflights, scheduler, etc.
├── docs/
│   ├── ARCHITECTURE.md
│   └── RELEASE.md
└── README.md
```

## Dashboard sections

The dashboard is split into seven bands:

| Band | Name | Content |
| --- | --- | --- |
| 01 | System Status | passport, KPIs, verdict, freshness |
| 02 | Conversation | last user query + agent response |
| 03 | Turns | run/turn history with pipeline steps |
| 04 | Memory | core size, vault quality, summaries |
| 05 | Tools | pipeline steps, tool diagnostics |
| 06 | Ops | attention, shift summary, guards, errors |
| 07 | Live | SSE event feed with filter legend |

## Verification

```bash
node --check server.js
node --check app.js
npx tsc --noEmit -p tsconfig.json

curl -s http://127.0.0.1:3001/api/dashboard/summary
curl -s http://127.0.0.1:3001/api/plans
curl -s http://127.0.0.1:3001/api/skills
curl -s http://127.0.0.1:3001/api/projects
curl -s http://127.0.0.1:3001/api/tasks
```

## License

[MIT](LICENSE)
