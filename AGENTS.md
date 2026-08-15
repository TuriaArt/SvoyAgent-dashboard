# AGENTS.md — guide for AI agents working in this repository

This file is for AI agents (and humans) who clone or contribute to this
repository. It explains what the project is, how it is structured, and the
rules to follow when modifying it.

## What this is

`agent-dashboard` is a **local cockpit dashboard** for an autonomous agent.
It is a single Node.js process with zero runtime dependencies:

- `server.js` — static file server + JSON API adapters + optional session auth
- `index.html`, `styles.css`, `app.js` — a vanilla-JS SPA (no build step)
- `src/core/` — anonymized reference of an agent pre-model pipeline (TypeScript)

The dashboard reads on-disk agent telemetry (JSONL logs, SQLite traces/tasks,
markdown vault files) and renders an operational overview. Without agent data
it degrades gracefully to neutral placeholders.

## Quick start

```bash
PORT=3001 DASHBOARD_AUTH=off node server.js
# → http://127.0.0.1:3001/
```

No `npm install` is required to run the dashboard itself.

## Deployment guide (for AI agents)

The user gives you a link to this repository and asks you to deploy it on
their host. Follow these steps in order. Ask the user before exposing the
dashboard beyond `127.0.0.1`.

### 1. Fetch and verify

```bash
git clone <repository-url> agent-dashboard
cd agent-dashboard

node --check server.js
node --check app.js
# no build step, no npm install required
```

### 2. Smoke run without data

Start on a random port with auth off to confirm the boilerplate works:

```bash
PORT=3999 DASHBOARD_AUTH=off node server.js &
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3999/
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3999/api/dashboard/summary
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3999/api/tasks
kill %1
```

Expected: `200` for all three. The summary returns `live: true` with neutral
placeholder values when no agent data exists.

### 3. Point at real agent data (optional but recommended)

The dashboard is useful only when it reads the agent's on-disk telemetry.
Set the env vars that match the user's setup:

```bash
export AGENT_ROOT=/path/to/agent
export AGENT_TRACE_DB=/path/to/agent/.agent/traces.db   # traces + tasks
export AGENT_PLANS_DIR=/path/to/agent/projects/one/plans
export AGENT_SKILLS_DIR=/path/to/agent/agent/skills
export AGENT_PROJECTS_DIR=/path/to/agent/obsidian-vault/projects
export ASSISTANT_VAULT_DIR=/path/to/agent/obsidian-vault/projects/one
```

If the user does not have these paths yet, skip this step — the dashboard
still runs and shows placeholders. Every `AGENT_*` var accepts an `IVA_*`
legacy alias. See README → Configuration for the full list.

### 4. Enable auth

Never expose the dashboard publicly without auth. Generate a password hash:

```bash
export DASHBOARD_AUTH=on
export DASHBOARD_USER=admin
export DASHBOARD_PASSWORD_HASH=$(echo -n 'choose-a-strong-password' | sha256sum | cut -d' ' -f1)
```

`DASHBOARD_PASSWORD_HASH` is preferred over plaintext `DASHBOARD_PASSWORD`.
If the dashboard will stay on localhost only, `DASHBOARD_AUTH=off` is
acceptable for a personal setup.

### 5. Run as a background service

Choose one of the two options.

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

**Option B — nohup (simple, non-systemd hosts):**

```bash
nohup env PORT=3001 DASHBOARD_AUTH=on DASHBOARD_USER=admin \
  DASHBOARD_PASSWORD_HASH=<hash> AGENT_ROOT=/path/to/agent \
  node server.js >> /var/log/agent-dashboard.log 2>&1 &
```

### 6. Verify the deployment

```bash
curl -s http://127.0.0.1:3001/api/dashboard/summary   # expect JSON, live:true
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3001/   # 200
```

Check the login page loads when auth is on (`GET /` → redirects to `/login`).
For remote access put the dashboard behind a reverse proxy with HTTPS and
basic auth (nginx/caddy/traefik) — do not expose port 3001 directly.

### 7. Report back

Tell the user: where the dashboard runs (URL), which auth is enabled, which
data sources are connected (or that it runs on placeholders), and how to stop
it (`systemctl --user stop agent-dashboard.service` or `kill <pid>`).

## Repository layout

```text
server.js            # static server + JSON API + auth
index.html           # page structure & modals
styles.css           # cockpit UI styling
app.js               # SPA state, rendering, filters, save handlers
package.json
tsconfig.json        # type-checks the self-contained core modules
src/core/            # agent pre-model pipeline reference (TypeScript)
docs/
  ARCHITECTURE.md    # endpoints, data sources, UI structure
  RELEASE.md         # release notes & anonymization checklist
AGENTS.md            # this file
README.md            # public-facing readme
LICENSE              # MIT
```

## Rules for agents

1. **Do not add personal data.** This is a public repository. No real names,
   handles, private paths, credentials, or environment files (`.env`) belong
   here. Use `$AGENT_ROOT`-relative paths and `process.env.*` references.
2. **Do not hardcode absolute paths.** Paths come from env vars
   (`AGENT_ROOT`, `AGENT_TRACE_DB`, `AGENT_PLANS_DIR`, …) with safe defaults
   relative to the project. `IVA_*` is a legacy alias for `AGENT_*`.
3. **Keep entities neutral.** Project identifiers are `one`…`seven`;
   curators are `curator-one`…`curator-five`. Never reintroduce real entity
   names (see `docs/RELEASE.md` for the mapping).
4. **Do not ship secrets.** Auth is env-driven:
   `DASHBOARD_AUTH`, `DASHBOARD_USER`, `DASHBOARD_PASSWORD`,
   `DASHBOARD_PASSWORD_HASH`, `DASHBOARD_SESSION_TOKEN`. Dev defaults
   (`admin` / `change-me`) are fine, but must stay marked "dev only".
5. **`src/core/` is a reference.** `events.ts`, `event-stream.ts`,
   `invariant.ts` compile with `tsc`. The pipeline modules reference runtime
   modules that are intentionally not shipped — annotate external imports in
   the file header, do not try to wire them into `server.js`.
6. **Smoke test after changes.** `node --check server.js && node --check
   app.js`, then start with `PORT=3999 DASHBOARD_AUTH=off node server.js`
   and curl `/`, `/api/dashboard/summary`, `/api/tasks`. Kill the process
   afterwards.
7. **Do not create `.env` files.** Configuration belongs in documented env
   vars (see README → Configuration).

## Verification commands

```bash
node --check server.js
node --check app.js
npx tsc --noEmit -p tsconfig.json   # only src/core self-contained modules

curl -s http://127.0.0.1:3001/api/dashboard/summary
curl -s http://127.0.0.1:3001/api/tasks
curl -s http://127.0.0.1:3001/api/plans
curl -s http://127.0.0.1:3001/api/skills
curl -s http://127.0.0.1:3001/api/projects
```

## License

MIT — see `LICENSE`.
