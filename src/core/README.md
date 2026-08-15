# src/core — Agent Core modules

Reference implementation of the **pre-model pipeline** that runs inside the
agent core. These modules are extracted from a larger private runtime and are
kept here as an anonymized architecture reference.

> These are TypeScript modules. They are **not** wired into the dashboard's
> `server.js` — the dashboard reads its data from files/databases produced by
> the real runtime. See `docs/ARCHITECTURE.md`.

## What is here

### Self-contained (compile with `tsc`)

| Module | Purpose |
| --- | --- |
| `events.ts` | Typed event bus: `TypedEventEmitter`, a global `eventBus`, and 15 typed event contracts (`SessionStarted`, `ToolCalled`, `ContextCompacted`, …). |
| `event-stream.ts` | Server-Sent Events (SSE) stream over `eventBus`, with a ring buffer that replays recent events on connect. |
| `invariant.ts` | Fail-fast `invariant()` assertion helper. |

These three have no runtime dependencies and are covered by `events.test.ts`.

### Pipeline modules (architecture reference)

These are the building blocks coordinated by `supervisor.ts`. Several of them
pull imports that live **outside** `src/core/` (see "External dependencies"
below), so they will **not** compile standalone in this boilerplate — they are
kept as readable reference code.

| Module | Purpose |
| --- | --- |
| `supervisor.ts` | The orchestrator. Runs the whole pre-model pipeline and returns a `PipelineResult`. |
| `classifier.ts` | Rule-based intent classification (config-driven, reads per-project `config.yml`). |
| `preflights.ts` | Deterministic pre-checks that can answer the user before any model call. |
| `evidence-journal.ts` | Append-only JSONL journal of artifacts gathered during multi-step work. |
| `synthetic-reader.ts` | Injects project files into the model context as synthetic `read_file` pairs. |
| `read-tracker.ts` | Tracks which files have already been injected this session (dedup). |
| `skill-triggers.ts` | Scans the user message against `## Auto triggers` sections of `SKILL.md` files. |
| `mcp-router.ts` | Per-project allow/block routing for MCP/tool connections. |
| `scheduler.ts` | Reminders with repeat intervals and due-checks. |
| `steering-queue.ts` | In-memory follow-up queue processed before responding to the user. |
| `trace-store.ts` | SQLite trace log written by the supervisor (`node:sqlite`). |
| `background-queue.ts` | Minimal fire-and-forget in-process job queue. |

## How the pipeline fits together

```
        user message
              │
              ▼
        classifier  ──►  intent + project
              │
              ▼
        preflights  ──►  (may answer directly and stop here)
              │
              ▼
        evidence-journal  ──►  context hint
              │
              ▼
        synthetic-reader  ──►  inject project files (dedup via read-tracker)
              │
              ├──► skill-triggers  ──►  auto-load matching skills
              ├──► content-guard    ──►  external-content hint
              ├──► verify-pending   ──►  verify previous-turn changes
              ├──► mcp-router       ──►  available tool connections
              ├──► scheduler        ──►  due reminders
              ├──► steering-queue   ──►  follow-up tasks
              └──► work-items       ──►  open work items
              │
              ▼
        PipelineResult ──►  passed to the model as prepared context
              │
              ▼
        trace-store  ──►  one row per step (persisted async via background-queue)
```

`events.ts` + `event-stream.ts` form the orthogonal telemetry layer: anything
can emit typed events onto the global `eventBus`, and an SSE stream exposes
them (with replay) to dashboards and live clients.

## External dependencies (outside `src/core/`)

These imports are intentionally left in place and annotated in the file
headers. They come from the real runtime and are not shipped here:

| File | Missing import | Notes |
| --- | --- | --- |
| `preflights.ts` | `./service-registry.js`, `./service-call.js` | Self-hosted service registry + health check. |
| `scheduler.ts` | `./db.ts` | Shared runtime DB handle. |
| `trace-store.ts` | `node:sqlite` | Node >= 22.5 with the `sqlite` flag. |
| `supervisor.ts` | (transitively all of the above) | Plus the transport layer (`messenger.ts`) for deferred trace persistence. |

## Compile / test

The three self-contained modules compile with a minimal tsconfig:

```bash
npx tsc --noEmit -p tsconfig.json
```

Run the event-bus tests (requires `@types/node` and `tsx`):

```bash
npm install --no-save typescript tsx @types/node
npx tsx --test src/core/events.test.ts
```

`supervisor.test.ts` needs the full runtime (`node:sqlite`, `service-registry`,
`db.ts`, …) and is kept only as a reference for the pipeline behavior.
