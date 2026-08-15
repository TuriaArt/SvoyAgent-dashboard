# Release notes

## v1.0.0 — public boilerplate

- **Date:** 2026-08-15
- **Version:** 1.0.0
- **Package:** `agent-dashboard` (Node.js, CommonJS, zero runtime dependencies)

### What is included

| Path | Description |
| --- | --- |
| `server.js` | Static server + JSON API adapters + optional session auth. |
| `index.html`, `styles.css`, `app.js` | Vanilla-JS dashboard SPA (no build step). |
| `src/core/` | Anonymized reference of the agent's pre-model pipeline modules (TypeScript). |
| `src/core/README.md` | How the core modules relate and what they depend on. |
| `docs/ARCHITECTURE.md` | Endpoints, data sources, and UI structure. |
| `docs/RELEASE.md` | This file. |
| `tsconfig.json` | Minimal config; type-checks `events.ts` + `event-stream.ts` + `invariant.ts`. |

### Anonymization checklist

Everything that could identify the owner, the runtime, or real entities was
removed or neutralized:

- [x] **People / agents** — removed the owner's name/handle and the agent's
      personal brand; replaced with neutral `Agent` / `Agent Core`.
- [x] **System name** — the private system name (`Iva`-style, all cases) →
      `Agent`/`AGENT`/`agent` (titles, descriptions, variables
      `ivaPath` → `agentPath`, etc.).
- [x] **Runtime name** — the private runtime name (`Eve`-style) → `agent`
      (comments, variables, and any CSS class names).
- [x] **Paths** — removed all absolute home/windows paths (`/root/…`,
      `D:\…\Code\…`, a personal vault name); replaced with `$AGENT_ROOT`-relative
      paths and env vars.
- [x] **Entities** — project names mapped to neutral labels:
      `default→one`, `health→two`, `business→three`, `strategy→four`,
      `mission→five`, `islam→six`, `secretary→seven`. Curators mapped to
      `curator-one` … `curator-five` (only referenced in docs; curators are
      read from `config.yml` at runtime).
- [x] **Channels** — `telegram`/`telegram_send`/`channel:telegram` →
      `messenger`/`messenger_send`/`channel:messenger`.
- [x] **Secrets** — no API keys, tokens, hashes, or real credentials remain.
      Auth defaults are dev-only (`admin` / `change-me`), overridable via
      `DASHBOARD_USER` / `DASHBOARD_PASSWORD` / `DASHBOARD_PASSWORD_HASH`.
      No `.env` files are included.

### How to run

```bash
PORT=3001 DASHBOARD_AUTH=off node server.js
# → http://127.0.0.1:3001/
```

```bash
# sanity checks
node --check server.js && node --check app.js
curl -s http://127.0.0.1:3001/api/dashboard/summary
curl -s http://127.0.0.1:3001/api/plans
curl -s http://127.0.0.1:3001/api/skills
curl -s http://127.0.0.1:3001/api/projects
curl -s http://127.0.0.1:3001/api/tasks
```

### Known limitations

- **The boilerplate runs without agent data.** When no `AGENT_ROOT` (or the
  per-concern env overrides) is provided, `/api/dashboard/summary` still
  returns `live: true` with zeroed/stub values, and the UI falls back to its
  bundled mock data. Nothing breaks, but the numbers are neutral placeholders.
- **Write endpoints require real data.** Plan/skill/project/task editing works
  only once the corresponding data directories and SQLite DBs exist.
- **`node:sqlite` is optional.** Trace/task reading needs Node ≥ 22.5 with
  `--experimental-sqlite`; otherwise those sources return empty and the
  dashboard degrades gracefully.
- **`src/core/` is a reference.** `events.ts`, `event-stream.ts`,
  `invariant.ts` compile with `tsc`; the pipeline modules reference runtime
  modules that are intentionally not shipped (`service-registry.js`,
  `service-call.js`, `db.ts`, `node:sqlite`, the messenger transport).

### Connecting real data sources

Point the dashboard at a real agent root via env, then restart:

```bash
export AGENT_ROOT=/path/to/agent
export AGENT_TRACE_DB=/path/to/agent/.agent/traces.db
export AGENT_DATA_DIR=/path/to/agent/data
export AGENT_PLANS_DIR=/path/to/agent/projects/one/plans
export AGENT_SKILLS_DIR=/path/to/agent/agent/skills
export AGENT_PROJECTS_DIR=/path/to/agent/obsidian-vault/projects
export DASHBOARD_AUTH=on
export DASHBOARD_USER=admin
export DASHBOARD_PASSWORD_HASH=$(echo -n 'your-password' | sha256sum | cut -d' ' -f1)
node server.js
```

`IVA_*` is accepted as a legacy alias for every `AGENT_*` variable.
