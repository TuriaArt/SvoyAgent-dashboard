const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require("node:sqlite"));
} catch {
  DatabaseSync = null;
}

const root = process.cwd();
const port = Number(process.env.PORT || 3001);
const authEnabled = process.env.DASHBOARD_AUTH !== "off";
const authUser = process.env.DASHBOARD_USER || "admin";
// dev only — set DASHBOARD_PASSWORD or DASHBOARD_PASSWORD_HASH in production
const authPassword = process.env.DASHBOARD_PASSWORD || "change-me";
const authPasswordHash = process.env.DASHBOARD_PASSWORD_HASH || "";
const sessionCookieName = "agent_dashboard_session";
const sessionToken =
  process.env.DASHBOARD_SESSION_TOKEN || sha256(`${authUser}:${authPasswordHash || authPassword}:agent-dashboard-session`);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const agentRoot = resolveAgentRoot();

// AGENT_* is the canonical env prefix; IVA_* is kept as a legacy alias.
function agentEnv(key) {
  return process.env[`AGENT_${key}`] || process.env[`IVA_${key}`] || undefined;
}

function resolveAgentRoot() {
  const candidates = [agentEnv("ROOT"), path.join(process.cwd(), "agent-data")].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function agentPath(...segments) {
  return path.join(agentRoot, ...segments);
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function firstExistingPath(...candidates) {
  return candidates.find((candidate) => candidate && fileExists(candidate)) || candidates.find(Boolean) || "";
}

function readText(filePath, fallback = "") {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return fallback;
  }
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(readText(filePath));
  } catch {
    return fallback;
  }
}

function readJsonl(filePath, limit = Infinity) {
  const text = readText(filePath).trim();
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const selected = Number.isFinite(limit) ? lines.slice(-limit) : lines;
  return selected
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function querySqlite(filePath, sql, params = []) {
  if (!DatabaseSync || !fileExists(filePath)) return [];
  let db;
  try {
    db = new DatabaseSync(filePath, { readOnly: true });
    return db.prepare(sql).all(...params);
  } catch {
    return [];
  } finally {
    if (db) db.close();
  }
}

function executeSqlite(filePath, callback) {
  if (!DatabaseSync) throw new Error("SQLite runtime is unavailable");
  if (!fileExists(filePath)) throw new Error(`SQLite file not found: ${filePath}`);
  let db;
  try {
    db = new DatabaseSync(filePath);
    return callback(db);
  } finally {
    if (db) db.close();
  }
}

function sqliteTableColumns(filePath, tableName) {
  return new Set(querySqlite(filePath, `pragma table_info(${tableName})`).map((column) => column.name));
}

function statMtime(filePath) {
  try {
    return fs.statSync(filePath).mtime;
  } catch {
    return null;
  }
}

function parseDate(value) {
  if (!value) return null;
  let normalized = String(value).trim().replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(normalized)) {
    normalized = `${normalized}Z`;
  }
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function timeLabel(value) {
  const date = value instanceof Date ? value : parseDate(value);
  if (!date) return "--:--";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function dateLabel(value) {
  const date = value instanceof Date ? value : parseDate(value);
  if (!date) return "--.--";
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}`;
}

function dateTimeLabel(value) {
  const date = value instanceof Date ? value : parseDate(value);
  if (!date) return "--.-- --:--";
  return `${dateLabel(date)} ${timeLabel(date)}`;
}

function formatAge(date) {
  if (!date) return "нет данных";
  const diff = Math.max(0, Date.now() - date.getTime());
  if (diff < 60_000) return "live";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч`;
  return `${Math.floor(hours / 24)} дней`;
}

function toneByAge(date, warnMinutes = 30, failMinutes = 24 * 60) {
  if (!date) return "fail";
  const minutes = Math.max(0, Date.now() - date.getTime()) / 60_000;
  if (minutes <= warnMinutes) return "ok";
  if (minutes <= failMinutes) return "warn";
  return "fail";
}

function compactNumber(value) {
  const number = Number(value) || 0;
  if (Math.abs(number) >= 1_000_000_000) return `${(number / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toFixed(2)}M`;
  if (Math.abs(number) >= 1_000) return `${(number / 1_000).toFixed(1)}k`;
  return String(Math.round(number));
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function readSelectedEnv() {
  const result = {};
  const allowed = new Set(["MODEL_PROVIDER", "DEEPSEEK_MODEL", "FALLBACK_MODEL", "ASSISTANT_VAULT_DIR", "ASSISTANT_DATA_DIR", "HEALTH_STATUS_PATH"]);
  for (const line of readText(agentPath(".env")).split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match || !allowed.has(match[1])) continue;
    result[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return result;
}

function toLocalAgentPath(value, fallbackSegments = []) {
  if (!value) return agentPath(...fallbackSegments);
  if (path.isAbsolute(value)) return value;
  return agentPath(value);
}

function readHealth(env) {
  const filePath = toLocalAgentPath(env.HEALTH_STATUS_PATH, ["health", "health.status"]);
  const lines = readText(filePath).split(/\r?\n/).filter(Boolean);
  const summary = lines[0] || "";
  const status = (lines[1] || "").trim().toLowerCase();
  const timestamp = parseDate(summary.split("|")[0]?.trim());
  const ok = Number(summary.match(/ok=(\d+)/i)?.[1] || 0);
  const warn = Number(summary.match(/warn=(\d+)/i)?.[1] || 0);
  const fail = Number(summary.match(/fail=(\d+)/i)?.[1] || 0);
  /*
  const enrichedGuards = [
    evalHarness.total
      ? [
          "eval-harness",
          evalHarness.status === "pass" && evalHarness.fail === 0 ? "pass" : "fail",
          [
            `${evalHarness.pass}/${evalHarness.total} PASS`,
            `expected_fail: ${evalHarness.expectedFail}`,
            evalHarness.detectors ? `detectors: ${evalHarness.detectors}` : null,
            evalHarness.ts ? `ts: ${dateTimeLabel(evalHarness.ts)}` : null,
            evalHarness.note || null,
            evalHarness.ratchetPolicy || null,
            `source: ${path.relative(agentRoot, evalHarness.filePath) || evalHarness.filePath}`,
          ]
            .filter(Boolean)
            .join(" · "),
        ]
      : ["eval-harness", "fail", `eval-harness-status.json not found · source: ${path.relative(agentRoot, evalHarness.filePath) || evalHarness.filePath}`],
    ...guards,
  ];
  */

  return {
    filePath,
    timestamp,
    ok,
    warn,
    fail,
    total: ok + warn + fail,
    status: fail ? "fail" : warn ? "warn" : status || "ok",
  };
}

function readPipeline() {
  const pipeline = readJson(agentPath("data", "pipeline-status.json"), {});
  const daily = pipeline.daily || {};
  return {
    updated: parseDate(pipeline.updated),
    status: String(daily.status || pipeline.status || "unknown").toLowerCase(),
    lastRun: parseDate(daily.last_run || pipeline.updated),
    durationMs: Number(daily.duration_ms || 0),
  };
}

function readDoctor() {
  const doctor = readJson(agentPath("data", "doctor-status.json"), {});
  return {
    updated: parseDate(doctor.updated),
    status: String(doctor.status || "unknown").toLowerCase(),
    score: Number(doctor.health_score || 0),
    trend: doctor.health_trend || "unknown",
    coreSize: Number(doctor.core_size || 0),
    coreCap: Number(doctor.core_cap || 1500),
    issues: Array.isArray(doctor.issues) ? doctor.issues : [],
  };
}

function readAgentStatus() {
  const startup = readJson(agentPath("data", "startup.json"), {});
  const startedAt = parseDate(startup.started_at || startup.ts || startup.startedAt);
  return {
    startedAt,
    uptime: startedAt ? formatAge(startedAt) : "local copy",
    source: startedAt ? "data/startup.json" : "process uptime is not available in copied files",
  };
}

function readEvalHarness() {
  const filePath = agentPath("data", "eval-harness-status.json");
  const result = readJson(filePath, {});
  return {
    filePath,
    ts: parseDate(result.ts),
    status: String(result.status || "unknown").toLowerCase(),
    total: Number(result.total || 0),
    pass: Number(result.pass || 0),
    fail: Number(result.fail || 0),
    expectedFail: Number(result.expected_fail || result.expectedFail || 0),
    detectors: Number(result.detectors || 0),
    note: result.note || "",
    ratchetPolicy: result.ratchet_policy || result.ratchetPolicy || "",
  };
}

function readUsage() {
  const entries = readJsonl(agentPath("data", "usage.jsonl"));
  const latest = entries.at(-1) || {};
  const turnKey = `${latest.sessionId || "session"}:${latest.turnId || "turn"}`;
  const lastTurnEntries = entries.filter((entry) => `${entry.sessionId || "session"}:${entry.turnId || "turn"}` === turnKey);
  const totals = entries.reduce(
    (acc, entry) => {
      acc.input += Number(entry.in || 0);
      acc.output += Number(entry.out || 0);
      acc.cacheRead += Number(entry.cacheRead || 0);
      acc.total += Number(entry.total || 0);
      acc.requests += 1;
      return acc;
    },
    { input: 0, output: 0, cacheRead: 0, total: 0, requests: 0 },
  );
  const turnTotals = lastTurnEntries.reduce(
    (acc, entry) => {
      acc.input += Number(entry.in || 0);
      acc.output += Number(entry.out || 0);
      acc.cacheRead += Number(entry.cacheRead || 0);
      acc.total += Number(entry.total || 0);
      return acc;
    },
    { input: 0, output: 0, cacheRead: 0, total: 0 },
  );
  return {
    entries,
    latest,
    latestAt: parseDate(latest.ts),
    totals,
    turnKey,
    lastTurnEntries,
    turnTotals,
  };
}

function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function sumUsageSince(entries, fromDate) {
  return entries
    .filter((entry) => {
      const date = parseDate(entry.ts);
      return date && date >= fromDate;
    })
    .reduce(
      (acc, entry) => {
        acc.input += Number(entry.in || 0);
        acc.output += Number(entry.out || 0);
        acc.cacheRead += Number(entry.cacheRead || 0);
        acc.cacheWrite += Number(entry.cacheWrite || 0);
        acc.total += Number(entry.total || 0);
        acc.records += 1;
        acc.turns.add(`${entry.sessionId || "session"}:${entry.turnId || "turn"}`);
        return acc;
      },
      { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, records: 0, turns: new Set() },
    );
}

function groupUsageTurns(entries, limit = 20) {
  const groups = new Map();
  for (const entry of entries) {
    const key = `${entry.sessionId || "session"}:${entry.turnId || "turn"}`;
    const group = groups.get(key) || {
      sessionId: entry.sessionId || "session",
      turnId: entry.turnId || "turn",
      source: entry.source || "unknown",
      model: entry.model || "unknown",
      provider: entry.provider || "unknown",
      lastAt: parseDate(entry.ts),
      input: 0,
      output: 0,
      cacheRead: 0,
      total: 0,
      steps: 0,
    };
    group.lastAt = parseDate(entry.ts) || group.lastAt;
    group.input += Number(entry.in || 0);
    group.output += Number(entry.out || 0);
    group.cacheRead += Number(entry.cacheRead || 0);
    group.total += Number(entry.total || 0);
    group.steps += 1;
    groups.set(key, group);
  }
  return Array.from(groups.values())
    .sort((a, b) => (b.lastAt?.getTime() || 0) - (a.lastAt?.getTime() || 0))
    .slice(0, limit);
}

function traceDbCandidates() {
  const candidates = [];
  if (agentEnv("TRACE_DB")) candidates.push(agentEnv("TRACE_DB"));
  if (agentEnv("DATA_DIR")) {
    const dir = path.isAbsolute(agentEnv("DATA_DIR")) ? agentEnv("DATA_DIR") : agentPath(agentEnv("DATA_DIR"));
    candidates.push(path.join(dir, "traces.db"));
  }
  if (process.env.HOME) candidates.push(path.join(process.env.HOME, ".agent", "traces.db"));
  candidates.push(agentPath(".agent", "traces.db"));
  candidates.push(agentPath("agent", ".agent", "traces.db"));
  candidates.push(agentPath("data", "traces.db"));
  candidates.push(agentPath("data", "tasks.db"));
  return [...new Set(candidates.filter(Boolean))];
}

function tasksDbCandidates() {
  const candidates = [];
  if (process.env.TASKS_DB_PATH) candidates.push(process.env.TASKS_DB_PATH);
  if (agentEnv("TASKS_DB")) candidates.push(agentEnv("TASKS_DB"));
  if (agentEnv("DATA_DIR")) {
    const dir = path.isAbsolute(agentEnv("DATA_DIR")) ? agentEnv("DATA_DIR") : agentPath(agentEnv("DATA_DIR"));
    candidates.push(path.join(dir, "tasks.db"));
  }
  candidates.push(agentPath("data", "tasks.db"));
  candidates.push(agentPath("agent", "data", "tasks.db"));
  return [...new Set(candidates.filter(Boolean))];
}

function resolveTasksDbPath() {
  return tasksDbCandidates().find((candidate) => fileExists(candidate)) || tasksDbCandidates()[0];
}

function parseTaskId(value) {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

function parseTaskList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : [];
  } catch {
    return String(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function stringifyTaskList(value) {
  return JSON.stringify(parseTaskList(value));
}

function dbStatusForColumn(column, fallback = "active") {
  if (column === "archive") return "archived";
  if (column === "done") return "done";
  if (column === "progress" || column === "review") return "in_progress";
  if (column === "backlog" || column === "plan") return "active";
  return fallback;
}

function dbPriorityForTask(priority, fallback = "med") {
  const value = String(priority || fallback || "med").toLowerCase();
  if (value === "mid") return "med";
  if (value === "high" || value === "med" || value === "low") return value;
  return "med";
}

function tagsForColumn(tags, column) {
  const next = parseTaskList(tags).filter((tag) => !["plan", "review"].includes(tag.toLowerCase()));
  if (column === "plan" && !next.includes("plan")) next.push("plan");
  if (column === "review" && !next.includes("review")) next.push("review");
  return next;
}

function readTaskById(taskId) {
  const rows = querySqlite(resolveTasksDbPath(), "select * from tasks where id = ? limit 1", [taskId]);
  return rows[0] || null;
}

function readTraceRows() {
  const candidates = traceDbCandidates();
  const diagnostics = [];

  for (const filePath of candidates) {
    const exists = fileExists(filePath);
    const size = exists ? fs.statSync(filePath).size : 0;
    diagnostics.push({ path: filePath, exists, size });
    if (!exists || size === 0) continue;
    const columns = sqliteTableColumns(filePath, "traces");
    if (!columns.has("timestamp") || !columns.has("step")) continue;
    const select = [
      columns.has("id") ? "id" : "null as id",
      "timestamp",
      columns.has("run_id") ? "run_id" : "null as run_id",
      columns.has("project") ? "project" : "null as project",
      columns.has("intent") ? "intent" : "null as intent",
      "step",
      "status",
      columns.has("duration_ms") ? "duration_ms" : "null as duration_ms",
      columns.has("error") ? "error" : "null as error",
      columns.has("message_preview") ? "message_preview" : "null as message_preview",
      columns.has("session_id") ? "session_id" : "null as session_id",
      columns.has("turn_id") ? "turn_id" : "null as turn_id",
      columns.has("trace_scope") ? "trace_scope" : "null as trace_scope",
      columns.has("reason") ? "reason" : "null as reason",
      columns.has("details_json") ? "details_json" : "null as details_json",
    ].join(", ");
    const orderBy = columns.has("id") ? "id desc" : "datetime(timestamp) desc";
    const sql = `select ${select} from traces order by ${orderBy} limit 1500`;
    const rows = querySqlite(filePath, sql);
    if (!rows.length) continue;
    const dailyRows = querySqlite(
      filePath,
      `select
        substr(timestamp, 1, 10) as day,
        count(distinct case
          when trace_scope = 'turn' and session_id is not null and turn_id is not null then session_id || ':' || turn_id
          when run_id is not null then run_id
          else id
        end) as count,
        max(case when status in ('fail', 'error') or error is not null then 1 else 0 end) as failed
       from traces
       group by substr(timestamp, 1, 10)
       order by day desc
       limit 14`,
    );
    const stats = querySqlite(filePath, "select count(*) as count, min(timestamp) as min_ts, max(timestamp) as max_ts from traces")[0] || {};
    return {
      rows,
      dailyRows,
      sourcePath: filePath,
      rowCount: Number(stats.count || rows.length),
      latestDate: parseDate(stats.max_ts || rows[0]?.timestamp),
      columns: Array.from(columns),
      diagnostics,
    };
  }

  return {
    rows: [],
    sourcePath: candidates.find((candidate) => fileExists(candidate)) || candidates[0],
    rowCount: 0,
    latestDate: null,
    columns: [],
    diagnostics,
  };
}

function readContextFootprint(sessionId, turnId) {
  const rows = readJsonl(agentPath("data", "context-footprint.jsonl"));
  return rows
    .filter((row) => row.session_id === sessionId && row.turn_id === turnId)
    .sort((a, b) => (parseDate(b.ts)?.getTime() || 0) - (parseDate(a.ts)?.getTime() || 0))[0] || null;
}

function findJsonlFiles(rootDir) {
  const result = [];
  function walk(dir) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(filePath);
      } else if (entry.name.toLowerCase().endsWith(".jsonl")) {
        result.push(filePath);
      }
    }
  }
  walk(rootDir);
  return result;
}

function readDialogTurn(sessionId, turnId) {
  const files = findJsonlFiles(agentPath("sessions")).filter((filePath) => path.basename(filePath) === "dialog.jsonl");
  const entries = files
    .flatMap((filePath) => readJsonl(filePath).map((entry) => ({ ...entry, filePath })))
    .filter((entry) => (entry.run_id || entry.runId) === sessionId && entry.turn_id === turnId);
  const user = entries.find((entry) => entry.role === "user");
  const assistant = entries.filter((entry) => entry.role === "assistant").at(-1);
  return {
    userQuery: user?.content || "",
    agentResponse: assistant?.content || "",
    chatId: user?.chat_id || assistant?.chat_id || entries[0]?.chat_id || "",
    filePath: user?.filePath || assistant?.filePath || entries[0]?.filePath || "",
    entries,
  };
}

function readRecentDialogMessages(limit = 12) {
  const files = findJsonlFiles(agentPath("sessions")).filter((filePath) => path.basename(filePath) === "dialog.jsonl");
  return files
    .flatMap((filePath) => readJsonl(filePath, 80).map((entry) => ({ ...entry, filePath })))
    .filter((entry) => entry.role === "user" || entry.role === "assistant")
    .sort((a, b) => (parseDate(b.timestamp)?.getTime() || 0) - (parseDate(a.timestamp)?.getTime() || 0))
    .slice(0, limit);
}

function readDiagnosticsForTurn(sessionId, turnId) {
  return findJsonlFiles(agentPath("diagnostics"))
    .flatMap((filePath) => readJsonl(filePath).map((entry) => ({ ...entry, filePath })))
    .filter((entry) => entry.session_id === sessionId && entry.turn_id === turnId)
    .sort((a, b) => (parseDate(a.timestamp)?.getTime() || 0) - (parseDate(b.timestamp)?.getTime() || 0));
}

function footprintSources(footprint, usageTurnTotals) {
  if (!footprint?.components?.length) {
    return [
      ["model input aggregate", "usage.jsonl", usageTurnTotals.input, "Full model input for this turn. Component footprint is not available."],
      ["cache read", "usage.jsonl", usageTurnTotals.cacheRead, "Prompt cache read tokens."],
      ["model output", "usage.jsonl", usageTurnTotals.output, "Model output tokens for this turn."],
    ];
  }

  const componentRows = footprint.components
    .slice()
    .sort((a, b) => Number(b.est_tokens || 0) - Number(a.est_tokens || 0))
    .map((component) => [
      component.part || "component",
      component.source_path ? path.basename(component.source_path) || "source" : "estimated",
      Number(component.est_tokens || 0),
      `${component.part || "component"}${component.source_path ? ` · ${component.source_path}` : ""} · ${component.chars || 0} chars`,
    ]);

  return [
    ["turn input total", "token meter", usageTurnTotals.input, "Sum of input tokens across all model steps in this turn. Source file: usage.jsonl. This is a token log, not a list of files."],
    ["model input step 0", "token meter", Number(footprint.usage_input_tokens || usageTurnTotals.input || 0), "Actual input tokens reported by provider for model step 0. Source file: usage.jsonl."],
    ["footprint total", "context-footprint", Number(footprint.total_est_tokens || 0), `${footprint.components.length} measured/estimated components.`],
    ...componentRows,
    ["turn output total", "token meter", usageTurnTotals.output, "Total output tokens across model steps for this turn. Source file: usage.jsonl."],
  ];
}

function diagnosticsSummaryRows(diagnosticsRows) {
  const byTool = new Map();
  for (const row of diagnosticsRows) {
    const tool = row.tool_name || row.tool || "tool";
    const group = byTool.get(tool) || { count: 0, ok: 0, fail: 0, durationMs: 0 };
    group.count += 1;
    group.ok += row.success === false || row.status === "error" ? 0 : 1;
    group.fail += row.success === false || row.status === "error" ? 1 : 0;
    group.durationMs += Number(row.duration_ms || row.durationMs || 0);
    byTool.set(tool, group);
  }
  return Array.from(byTool.entries()).map(([tool, group]) => ({
    tool,
    ...group,
  }));
}

function buildRuns(traceRows, usageEntries, traceDailyRows = []) {
  if (traceDailyRows.length) {
    return traceDailyRows
      .slice()
      .sort((a, b) => String(a.day).localeCompare(String(b.day)))
      .slice(-14)
      .map((day) => [dateLabel(day.day), Number(day.count || 0), Boolean(day.failed)]);
  }
  const latestTraceDate = parseDate(traceRows[0]?.timestamp);
  const traceIsFresh = latestTraceDate && Date.now() - latestTraceDate.getTime() < 7 * 24 * 60 * 60 * 1000;
  const byDay = new Map();
  const sourceRows = traceIsFresh
    ? traceRows.map((row) => ({ date: parseDate(row.timestamp), failed: row.status === "fail" || Boolean(row.error) }))
    : usageEntries.map((entry) => ({ date: parseDate(entry.ts), failed: false, key: `${entry.sessionId}:${entry.turnId}` }));

  for (const row of sourceRows) {
    if (!row.date) continue;
    const key = dateLabel(row.date);
    const day = byDay.get(key) || { keys: new Set(), count: 0, failed: false, date: row.date };
    if (row.key) day.keys.add(row.key);
    else day.count += 1;
    day.failed = day.failed || row.failed;
    byDay.set(key, day);
  }

  return Array.from(byDay.values())
    .sort((a, b) => a.date - b.date)
    .slice(-14)
    .map((day) => [dateLabel(day.date), day.keys.size || day.count, day.failed]);
}

function buildTraceTurns(traceRows, usageEntries) {
  const usageTurns = groupUsageTurns(usageEntries, 20);
  const dialogCache = new Map();
  const turnTitle = (sessionId, turnId, fallback, preview = "") => {
    const key = `${sessionId || ""}:${turnId || ""}`;
    if (sessionId && turnId && !dialogCache.has(key)) {
      dialogCache.set(key, readDialogTurn(sessionId, turnId));
    }
    const query = dialogCache.get(key)?.userQuery || preview || fallback || "turn";
    return String(query).split(/\r?\n/)[0].trim().slice(0, 120) || fallback || "turn";
  };
  if (!traceRows.length) {
    return usageTurns.map((turn) => ({
      time: timeLabel(turn.lastAt),
      intent: turn.source,
      status: "ok",
      duration: `${turn.steps} steps`,
      steps: `${compactNumber(turn.input)} input · ${compactNumber(turn.output)} output · ${compactNumber(turn.cacheRead)} cache`,
    }));
  }

  const latestTraceDate = parseDate(traceRows[0].timestamp);
  if (latestTraceDate && Date.now() - latestTraceDate.getTime() > 7 * 24 * 60 * 60 * 1000) {
    return usageTurns.map((turn) => ({
      time: timeLabel(turn.lastAt),
      intent: turn.source,
      status: "ok",
      duration: `${turn.steps} steps`,
      steps: `usage.jsonl · ${compactNumber(turn.input)} input · ${compactNumber(turn.output)} output · trace store stale`,
    }));
  }

  const scopedRows = traceRows.filter((row) => row.trace_scope === "turn" && row.session_id && row.turn_id);
  if (scopedRows.length) {
    const scopedGroups = new Map();
    for (const row of scopedRows) {
      const key = `${row.session_id}:${row.turn_id}`;
      const group = scopedGroups.get(key) || {
        key,
        time: parseDate(row.timestamp),
        project: row.project || "one",
        intent: row.intent || row.project || "turn",
        sessionId: row.session_id,
        turnId: row.turn_id,
        preview: row.message_preview || "",
        durationMs: 0,
        hasFail: false,
        hasWarn: false,
        steps: [],
      };
      const rowTime = parseDate(row.timestamp);
      if (rowTime && (!group.time || rowTime > group.time)) group.time = rowTime;
      group.durationMs += Number(row.duration_ms || 0);
      group.hasFail = group.hasFail || row.status === "fail" || row.status === "error" || Boolean(row.error);
      group.hasWarn = group.hasWarn || row.status === "warn";
      if (!group.preview && row.message_preview) group.preview = row.message_preview;
      group.steps.unshift(`${row.step} ${row.status}${row.error ? `: ${row.error}` : ""}`);
      scopedGroups.set(key, group);
    }
    return Array.from(scopedGroups.values())
      .sort((a, b) => (b.time?.getTime() || 0) - (a.time?.getTime() || 0))
      .slice(0, 20)
      .map((turn) => ({
        time: timeLabel(turn.time),
        intent: turnTitle(turn.sessionId, turn.turnId, turn.intent, turn.preview),
        status: turn.hasFail ? "error" : turn.hasWarn ? "warn" : "ok",
        duration: `${turn.durationMs}ms`,
        steps: turn.steps.join(" · "),
      }));
  }

  const groups = new Map();
  for (const row of traceRows) {
    const group = groups.get(row.run_id) || {
      runId: row.run_id,
      time: parseDate(row.timestamp),
      project: row.project || "one",
      intent: row.intent || row.project || "turn",
      durationMs: 0,
      hasFail: false,
      hasWarn: false,
      steps: [],
    };
    group.durationMs += Number(row.duration_ms || 0);
    group.hasFail = group.hasFail || row.status === "fail" || Boolean(row.error);
    group.hasWarn = group.hasWarn || row.status === "warn";
    group.steps.unshift(`${row.step} ${row.status}${row.error ? `: ${row.error}` : ""}`);
    groups.set(row.run_id, group);
  }

  return Array.from(groups.values())
    .sort((a, b) => (b.time?.getTime() || 0) - (a.time?.getTime() || 0))
    .slice(0, 20)
    .map((turn) => ({
      time: timeLabel(turn.time),
      intent: turn.intent,
      status: turn.hasFail ? "error" : turn.hasWarn ? "warn" : "ok",
      duration: `${turn.durationMs}ms`,
      steps: turn.steps.join(" · "),
    }));
}

function latestDialogLog() {
  const sessionsDir = agentPath("sessions");
  let dialogPath = "";
  try {
    dialogPath = fs
      .readdirSync(sessionsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(sessionsDir, entry.name, "dialog.jsonl"))
      .filter(fileExists)
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  } catch {
    dialogPath = "";
  }
  return readJsonl(dialogPath || "", 12)
    .slice(-4)
    .reverse()
    .map((entry) => {
      const chars = String(entry.content || "").length;
      const note = `${entry.status || "logged"} · ${chars} chars${entry.durationMs ? ` · ${entry.durationMs}ms` : ""}`;
      return [timeLabel(entry.timestamp), entry.role || "event", note];
    });
}

function countMarkdownFiles(dir) {
  const result = { total: 0, changedToday: 0, latest: null };
  const today = new Date();
  function walk(folder) {
    let entries = [];
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const filePath = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        walk(filePath);
        continue;
      }
      if (!entry.name.toLowerCase().endsWith(".md")) continue;
      const mtime = statMtime(filePath);
      result.total += 1;
      if (mtime && mtime.toDateString() === today.toDateString()) result.changedToday += 1;
      if (mtime && (!result.latest || mtime > result.latest)) result.latest = mtime;
    }
  }
  walk(dir);
  return result;
}

function listMarkdownFiles(dir) {
  const files = [];
  function walk(folder) {
    let entries = [];
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const filePath = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        walk(filePath);
      } else if (entry.name.toLowerCase().endsWith(".md")) {
        files.push(filePath);
      }
    }
  }
  walk(dir);
  return files;
}

function latestMarkdownIn(dir) {
  const files = listMarkdownFiles(dir)
    .map((filePath) => ({ filePath, mtime: statMtime(filePath), size: fs.statSync(filePath).size }))
    .filter((file) => file.mtime)
    .sort((a, b) => b.mtime - a.mtime);
  return files[0] || null;
}

function latestMarkdownBySegment(rootDir, segmentNames) {
  const wanted = new Set(segmentNames.map((segment) => segment.toLowerCase()));
  const files = listMarkdownFiles(rootDir)
    .filter((filePath) => {
      const parts = path.relative(rootDir, filePath).replace(/\\/g, "/").split("/").map((part) => part.toLowerCase());
      return parts.some((part) => wanted.has(part));
    })
    .map((filePath) => ({ filePath, mtime: statMtime(filePath), size: fs.statSync(filePath).size }))
    .filter((file) => file.mtime)
    .sort((a, b) => b.mtime - a.mtime);
  return files[0] || null;
}

function summaryStatus(latest, warnDays, failDays) {
  if (!latest) return { status: "fail", age: "missing" };
  const ageDays = (Date.now() - latest.mtime.getTime()) / 86_400_000;
  return {
    status: ageDays > failDays ? "fail" : ageDays > warnDays ? "warn" : "ok",
    age: formatAge(latest.mtime),
  };
}

function scanVaultQuality(vaultPath) {
  const files = listMarkdownFiles(vaultPath);
  const byStem = new Map();
  const incoming = new Map();
  const allKeys = new Set();
  let brokenLinks = 0;
  let totalBytes = 0;
  let changedToday = 0;
  let stale30 = 0;
  let latest = null;
  const today = new Date().toDateString();

  const allDiskFiles = new Set();
  function collectAllFiles(folder) {
    let entries = [];
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const p = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        collectAllFiles(p);
      } else {
        const rel = path.relative(vaultPath, p).replace(/\\/g, "/");
        allDiskFiles.add(rel.toLowerCase());
        const dotIdx = rel.lastIndexOf(".");
        if (dotIdx > 0) {
          allDiskFiles.add(rel.substring(0, dotIdx).toLowerCase());
        }
      }
    }
  }
  collectAllFiles(vaultPath);

  const legacyVaultDir = agentPath("obsidian-vault", "vault");
  const legacyKeys = new Set();
  if (fileExists(legacyVaultDir)) {
    const legacyFiles = listMarkdownFiles(legacyVaultDir);
    for (const fp of legacyFiles) {
      const rel = path.relative(legacyVaultDir, fp).replace(/\\/g, "/").replace(/\.md$/i, "");
      legacyKeys.add(rel.toLowerCase());
      legacyKeys.add(path.basename(rel).toLowerCase());
    }
  }

  for (const filePath of files) {
    const relative = path.relative(vaultPath, filePath).replace(/\\/g, "/");
    const stem = relative.replace(/\.md$/i, "");
    const basename = path.basename(stem).toLowerCase();
    allKeys.add(stem.toLowerCase());
    allKeys.add(basename);
    byStem.set(basename, (byStem.get(basename) || 0) + 1);
    incoming.set(stem.toLowerCase(), incoming.get(stem.toLowerCase()) || 0);

    const mtime = statMtime(filePath);
    const size = fs.statSync(filePath).size;
    totalBytes += size;
    if (mtime) {
      if (!latest || mtime > latest) latest = mtime;
      if (mtime.toDateString() === today) changedToday += 1;
      if (Date.now() - mtime.getTime() > 30 * 86_400_000) stale30 += 1;
    }

  }

  for (const filePath of files) {
    const text = readText(filePath);
    for (const match of text.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) {
      const target = String(match[1] || "").trim().replace(/\\/g, "/").replace(/\.md$/i, "");
      if (!target) continue;
      const normalized = target.toLowerCase();
      if (target.includes("...")) continue;
      if (target.includes("<") || target.includes(">")) continue;
      if (target.startsWith("[[")) continue;
      if (/^(\.\.\/|agent\/|vault\/)/.test(target)) continue;
      if (/\s/.test(target) && !allDiskFiles.has(normalized)) continue;
      const targetBase = path.basename(normalized);
      const existsLocally = allKeys.has(normalized) || allKeys.has(targetBase) || allDiskFiles.has(normalized);
      const existsLegacy = legacyKeys.has(normalized) || legacyKeys.has(targetBase);
      if (!existsLocally && !existsLegacy) brokenLinks += 1;
      incoming.set(normalized, (incoming.get(normalized) || 0) + 1);
      incoming.set(targetBase, (incoming.get(targetBase) || 0) + 1);
    }
  }

  const duplicates = Array.from(byStem.values()).filter((count) => count > 1).length;
  const orphans = files.filter((filePath) => {
    const relative = path.relative(vaultPath, filePath).replace(/\\/g, "/").replace(/\.md$/i, "").toLowerCase();
    const base = path.basename(relative);
    return !/(^|\/)(daily|summaries|index|moc)\b/i.test(relative) && !(incoming.get(relative) || incoming.get(base));
  }).length;

  return {
    files: files.length,
    totalBytes,
    changedToday,
    stale30,
    latest,
    brokenLinks,
    duplicates,
    orphans,
  };
}

function readMemoryAnalysis(env, doctor) {
  const configuredVaultPath = toLocalAgentPath(env.ASSISTANT_VAULT_DIR, ["obsidian-vault", "projects", "one"]);
  // configuredVaultPath must come first so the Memory section always reads
  // the DEFAULT project vault (daily/weekly/monthly per-project), not the
  // multi-project root that would mix results across all projects.
  const vaultPath = firstExistingPath(
    configuredVaultPath,
    agentPath("obsidian-vault"),
    agentPath("vault"),
    agentPath("agent-vault"),
  );
  const quality = scanVaultQuality(vaultPath);
  const daily = latestMarkdownBySegment(vaultPath, ["daily"]);
  const weekly = latestMarkdownBySegment(vaultPath, ["weekly"]);
  const monthly = latestMarkdownBySegment(vaultPath, ["monthly"]);
  const taskRefStats = querySqlite(
    resolveTasksDbPath(),
    "select count(*) as total, sum(case when vault_refs is not null and length(vault_refs)>2 then 1 else 0 end) as with_refs from tasks",
  )[0] || { total: 0, with_refs: 0 };
  const corePercent = doctor.coreCap ? Math.round((doctor.coreSize / doctor.coreCap) * 100) : 0;
  return {
    core: {
      score: doctor.score || 0,
      trend: doctor.trend || "unknown",
      size: doctor.coreSize || 0,
      cap: doctor.coreCap || 0,
      percent: corePercent,
      issues: doctor.issues.length,
      tone: corePercent > 85 || doctor.score < 75 ? "fail" : corePercent > 70 || doctor.score < 85 ? "warn" : "ok",
      source: "data/doctor-status.json",
    },
    summaries: [
      { label: "daily", ...summaryStatus(daily, 2, 7), file: daily ? path.relative(vaultPath, daily.filePath) : "missing" },
      { label: "weekly", ...summaryStatus(weekly, 10, 21), file: weekly ? path.relative(vaultPath, weekly.filePath) : "missing" },
      { label: "monthly", ...summaryStatus(monthly, 45, 75), file: monthly ? path.relative(vaultPath, monthly.filePath) : "missing" },
    ],
    quality: {
      files: quality.files,
      mb: Number((quality.totalBytes / 1_048_576).toFixed(2)),
      changedToday: quality.changedToday,
      stale30: quality.stale30,
      latest: quality.latest ? formatAge(quality.latest) : "missing",
      brokenLinks: quality.brokenLinks,
      duplicates: quality.duplicates,
      orphans: quality.orphans,
      source: path.relative(agentRoot, vaultPath) || vaultPath,
    },
    hygiene: {
      tasksTotal: Number(taskRefStats.total || 0),
      tasksWithVaultRefs: Number(taskRefStats.with_refs || 0),
      vaultRefPercent: taskRefStats.total ? Math.round((Number(taskRefStats.with_refs || 0) / Number(taskRefStats.total)) * 100) : 0,
      stale30: quality.stale30,
      changedToday: quality.changedToday,
    },
  };
}

function readWorkItems() {
  const candidates = [agentPath("data", "work-items.db"), agentPath("work-items.db")];
  for (const filePath of candidates) {
    const rows = querySqlite(
      filePath,
      "select id, title, state, failed_guards, updated_at from work_items order by datetime(updated_at) desc limit 20",
    );
    if (rows.length) return rows;
  }
  return [];
}

function readTasks() {
  return querySqlite(
    resolveTasksDbPath(),
    "select * from tasks order by datetime(updated_at) desc limit 250",
  );
}

function readGuards() {
  const guards = readJson(agentPath("guards", "index.json"), {});
  const detectors = Array.isArray(guards.detectors) ? guards.detectors : [];
  return detectors.slice(0, 10).map((guard) => [
    guard.name || guard.id || "guard",
    String(guard.note || "").toLowerCase().includes("не влияет")
      ? "ignored"
      : String(guard.last_result || guard.status || "unknown").toLowerCase() === "pass"
        ? "pass"
        : "fail",
    [
      guard.description || guard.reason || "guard from guards/index.json",
      `source: guards/index.json`,
      `last_result: ${guard.last_result || "unknown"}`,
      guard.last_run ? `last_run: ${dateTimeLabel(new Date(guard.last_run))}` : null,
      guard.note ? `note: ${guard.note}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  ]);
}

function resolvePlansDir() {
  const candidates = [
    agentEnv("PLANS_DIR"),
    agentPath("projects", "one", "plans"),
    path.join(process.env.USERPROFILE || "", "Documents", "AgentVault", "projects", "one", "plans"),
    path.join(process.env.HOME || "", "Documents", "AgentVault", "projects", "one", "plans"),
  ].filter(Boolean);
  return candidates.find((candidate) => fileExists(candidate)) || candidates[0] || "";
}

function planStatusFromText(fileName, text) {
  const lower = `${fileName}\n${text.slice(0, 1600)}`.toLowerCase();
  if (/archive|archived|deprecated|closed|done|complete|completed|архив|закрыт|готово/.test(lower)) return "archive";
  if (/draft|черновик|todo|backlog/.test(lower)) return "draft";
  if (/blocked|blocker|risk|fail|error|блок|риск/.test(lower)) return "attention";
  if (/weekly|roadmap|active|plan|план|стратег/.test(lower)) return "active";
  return "reference";
}

function planHorizonFromName(fileName, text) {
  const lower = `${fileName}\n${text.slice(0, 1000)}`.toLowerCase();
  if (/year|yearly|год|annual/.test(lower)) return "year";
  if (/month|monthly|месяц/.test(lower)) return "month";
  if (/week|weekly|недел/.test(lower)) return "week";
  if (/day|daily|день/.test(lower)) return "day";
  return "project";
}

function extractPlanTitle(fileName, text) {
  const h1 = text.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim().replace(/`/g, "");
  return fileName.replace(/\.md$/i, "").replace(/[-_]+/g, " ");
}

function extractPlanSummary(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("---") && !/^[-*]\s*$/.test(line));
  const first = lines.find((line) => !/^[-*]\s+/.test(line)) || lines[0] || "";
  return first.replace(/\s+/g, " ").slice(0, 260);
}

function extractPlanTags(fileName, text) {
  const tags = new Set();
  const cleanTag = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/^[\[#"'`]+|[\]#"',:`]+$/g, "");
  for (const part of fileName.replace(/\.md$/i, "").split(/[-_\s]+/)) {
    const tag = cleanTag(part);
    if (tag && tag.length > 2 && !/^\d{4}$/.test(tag)) tags.add(tag);
  }
  const explicit = text.match(/(?:tags|теги)\s*:\s*([^\n]+)/i);
  if (explicit) {
    explicit[1]
      .split(/[,#\s]+/)
      .map(cleanTag)
      .filter((tag) => tag.length > 1)
      .forEach((tag) => tags.add(tag));
  }
  return [...tags].slice(0, 8);
}

function extractPlanProject(fileName, text, tags) {
  const explicit = text.match(/^project\s*:\s*([^\n]+)/im);
  const clean = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/^[\[#"'`]+|[\]#"',:`]+$/g, "");
  if (explicit) {
    const project = clean(explicit[1]);
    if (project) return project;
  }
  const generic = new Set([
    "plan",
    "plans",
    "weekly",
    "daily",
    "monthly",
    "yearly",
    "phase",
    "spec",
    "design",
    "implementation",
    "mvp",
    "doc",
    "note",
    "process",
    "strategy",
    "architecture",
    "status",
    "index",
  ]);
  const candidates = [
    ...tags,
    ...fileName
      .replace(/\.md$/i, "")
      .split(/[-_\s]+/)
      .map(clean),
  ];
  return candidates.find((tag) => tag && tag.length > 2 && !generic.has(tag) && !/^\d+$/.test(tag)) || "one";
}

function readPlans() {
  const dir = resolvePlansDir();
  if (!dir || !fileExists(dir)) return { ok: false, root: dir, plans: [], stats: {}, tags: [] };
  const files = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .filter((entry) => !["plans_index.md", "plans_architecture.md"].includes(entry.name.toLowerCase()))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
  const plans = files.map((fileName) => {
    const filePath = path.join(dir, fileName);
    const text = readText(filePath);
    const stat = fs.statSync(filePath);
    const tags = extractPlanTags(fileName, text);
    return {
      id: fileName,
      fileName,
      title: extractPlanTitle(fileName, text),
      summary: extractPlanSummary(text),
      status: planStatusFromText(fileName, text),
      horizon: planHorizonFromName(fileName, text),
      project: extractPlanProject(fileName, text, tags),
      tags,
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
      updatedLabel: dateTimeLabel(stat.mtime),
      content: text,
      path: filePath,
    };
  });
  const stats = plans.reduce(
    (acc, plan) => {
      acc.total += 1;
      acc[plan.status] = (acc[plan.status] || 0) + 1;
      acc[plan.horizon] = (acc[plan.horizon] || 0) + 1;
      acc[`project:${plan.project}`] = (acc[`project:${plan.project}`] || 0) + 1;
      return acc;
    },
    { total: 0 },
  );
  const tags = [...new Set(plans.flatMap((plan) => plan.tags))].sort().slice(0, 40);
  const projects = [...new Set(plans.map((plan) => plan.project))].sort();
  return { ok: true, root: dir, plans, stats, tags, projects };
}

function safePlanPath(planId) {
  const dir = resolvePlansDir();
  const fileName = path.basename(String(planId || ""));
  if (!fileName.toLowerCase().endsWith(".md")) return null;
  const filePath = path.normalize(path.join(dir, fileName));
  const normalizedDir = path.normalize(dir + path.sep);
  if (!filePath.startsWith(normalizedDir)) return null;
  return filePath;
}

// SvoyAgentOS's default recipe store — same portable root Rust-side install_paths.rs
// uses for backends/omnix (see SvoyAgent-File/src-tauri/src/install_paths.rs).
function defaultRecipesDir() {
  const localAppData = process.env.LOCALAPPDATA || "";
  if (!localAppData) return "";
  return path.join(localAppData, "Meridian", "svoyagent", "recipes");
}

function resolveSkillsDir() {
  const candidates = [
    agentEnv("SKILLS_DIR"),
    defaultRecipesDir(),
    agentPath("agent", "skills"), // legacy iva layout, kept as a last-resort fallback
  ].filter(Boolean);
  return candidates.find((candidate) => fileExists(candidate)) || candidates[0] || "";
}

// Малый парсер YAML-шапки рецептов SvoyAgentOS (frontmatter между "---") — без
// внешних зависимостей, поскольку chip-dashboard принципиально zero-dependency.
// Понимает плоские "key: value", инлайн-списки "key: [a, b]" и блочные списки
// ("key:" + строки "  - value") — этого достаточно для формата RecipeFrontmatter
// (id/title/description/stepType/tags/version), см. server/src/recipes/frontmatter.ts
// в основном репозитории SvoyAgentOS.
function parseRecipeFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: text };
  const [, block, body] = match;
  const frontmatter = {};
  let listKey = null;
  for (const line of block.split(/\r?\n/)) {
    const listItem = line.match(/^\s+-\s*(.*)$/);
    if (listItem && listKey) {
      frontmatter[listKey].push(listItem[1].trim().replace(/^["']|["']$/g, ""));
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    const [, key, rawValue] = kv;
    const value = rawValue.trim();
    if (value === "") {
      frontmatter[key] = [];
      listKey = key;
      continue;
    }
    listKey = null;
    if (/^\[.*\]$/.test(value)) {
      frontmatter[key] = value
        .slice(1, -1)
        .split(",")
        .map((v) => v.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else if (/^-?\d+$/.test(value)) {
      frontmatter[key] = Number(value);
    } else {
      frontmatter[key] = value.replace(/^["']|["']$/g, "");
    }
  }
  return { frontmatter, body: body.trim() };
}

// Рецепты SvoyAgentOS всегда плоские файлы "<id>.md" (см. FsRecipeStore) — в
// отличие от iva-скиллов здесь нет вложенных папок-с-SKILL.md.
function readSkills() {
  const dir = resolveSkillsDir();
  if (!dir || !fileExists(dir)) return { ok: false, root: dir, skills: [], stats: {} };
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .sort((a, b) => a.name.localeCompare(b.name));
  const skills = entries.map((entry) => {
    const filePath = path.join(dir, entry.name);
    const stat = fs.statSync(filePath);
    const text = readText(filePath);
    const { frontmatter } = parseRecipeFrontmatter(text);
    return {
      id: entry.name,
      name: entry.name.replace(/\.md$/i, ""),
      title: frontmatter.title || entry.name.replace(/\.md$/i, ""),
      summary: String(frontmatter.description || "").slice(0, 260),
      type: "file",
      mainFile: entry.name,
      hasScripts: false,
      stepType: frontmatter.stepType || "",
      tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
      updatedLabel: dateTimeLabel(stat.mtime),
      content: text,
      path: filePath,
    };
  });
  const stats = skills.reduce(
    (acc, skill) => {
      acc.total += 1;
      acc[skill.type] = (acc[skill.type] || 0) + 1;
      if (skill.stepType) acc[`stepType:${skill.stepType}`] = (acc[`stepType:${skill.stepType}`] || 0) + 1;
      return acc;
    },
    { total: 0, file: 0 },
  );
  return { ok: true, root: dir, skills, stats };
}

function safeSkillPath(skillId) {
  const dir = resolveSkillsDir();
  const fileName = path.basename(String(skillId || ""));
  if (!fileName.toLowerCase().endsWith(".md")) return null;
  const filePath = path.normalize(path.join(dir, fileName));
  const normalizedDir = path.normalize(dir + path.sep);
  if (!filePath.startsWith(normalizedDir)) return null;
  return filePath;
}

function resolveProjectsDir() {
  const candidates = [
    agentEnv("PROJECTS_DIR"),
    agentPath("obsidian-vault", "projects"),
  ].filter(Boolean);
  return candidates.find((candidate) => fileExists(candidate)) || candidates[0] || "";
}

function extractYamlValue(text, key) {
  const match = String(text || "").match(new RegExp(`^\\s*${key}\\s*:\\s*["']?([^"'\\n]+)["']?`, "im"));
  return match ? match[1].trim() : "";
}

function countProjectFiles(dir) {
  const totals = { md: 0, json: 0, dirs: 0, files: 0, bytes: 0, lastWrite: null };
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        totals.dirs += 1;
        walk(fullPath);
      } else if (entry.isFile()) {
        const stat = fs.statSync(fullPath);
        totals.files += 1;
        totals.bytes += stat.size;
        if (entry.name.toLowerCase().endsWith(".md")) totals.md += 1;
        if (entry.name.toLowerCase().endsWith(".json")) totals.json += 1;
        if (!totals.lastWrite || stat.mtime > totals.lastWrite) totals.lastWrite = stat.mtime;
      }
    }
  };
  walk(dir);
  return totals;
}

function readProjectFileSummary(dir, fileName) {
  const filePath = path.join(dir, fileName);
  if (!fileExists(filePath)) return null;
  const text = readText(filePath);
  return {
    file: fileName,
    exists: true,
    size: fs.statSync(filePath).size,
    preview: extractPlanSummary(text),
    content: text,
  };
}

function readProjects() {
  const dir = resolveProjectsDir();
  if (!dir || !fileExists(dir)) return { ok: false, root: dir, projects: [], stats: {}, curators: [] };
  const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
  const projects = entries.map((entry) => {
    const projectDir = path.join(dir, entry.name);
    const config = readText(path.join(projectDir, "config.yml"));
    const index = readText(path.join(projectDir, "INDEX.md"));
    const agents = readText(path.join(projectDir, "AGENTS.md"));
    const tovPath = path.join(projectDir, "tone-of-voice.md");
    const metrics = countProjectFiles(projectDir);
    const curator = extractYamlValue(config, "curator") || extractYamlValue(agents, "curator") || "unknown";
    const description = extractYamlValue(config, "description") || (index.match(/^#\s+(.+)$/m) || [])[1] || entry.name;
    const keyFiles = ["context.md", "state.md", "tone-of-voice.md", "SKILLS.md", "AGENTS.md", "CORE.md", "INDEX.md"]
      .map((fileName) => readProjectFileSummary(projectDir, fileName))
      .filter(Boolean);
    const folders = fs.readdirSync(projectDir, { withFileTypes: true }).filter((child) => child.isDirectory()).map((child) => child.name).sort();
    return {
      id: entry.name,
      name: entry.name,
      title: entry.name,
      curator,
      description,
      root: projectDir,
      folders,
      files: keyFiles,
      mdCount: metrics.md,
      jsonCount: metrics.json,
      dirCount: metrics.dirs,
      fileCount: metrics.files,
      size: metrics.bytes,
      updatedAt: metrics.lastWrite ? metrics.lastWrite.toISOString() : fs.statSync(projectDir).mtime.toISOString(),
      updatedLabel: dateTimeLabel(metrics.lastWrite || fs.statSync(projectDir).mtime),
      tov: fileExists(tovPath) ? readText(tovPath) : "",
      hasTov: fileExists(tovPath),
    };
  });
  const curators = [...new Set(projects.map((project) => project.curator))].sort();
  const stats = projects.reduce(
    (acc, project) => {
      acc.total += 1;
      acc.curators = curators.length;
      if (project.hasTov) acc.tov += 1;
      if (Date.now() - new Date(project.updatedAt).getTime() <= 1000 * 60 * 60 * 24 * 7) acc.fresh += 1;
      return acc;
    },
    { total: 0, curators: 0, tov: 0, fresh: 0 },
  );
  return { ok: true, root: dir, projects, stats, curators };
}

function safeProjectTovPath(projectId) {
  const dir = resolveProjectsDir();
  const project = path.basename(String(projectId || ""));
  if (!project) return null;
  const projectDir = path.normalize(path.join(dir, project));
  const normalizedDir = path.normalize(dir + path.sep);
  if (!projectDir.startsWith(normalizedDir) || !fileExists(projectDir)) return null;
  return path.join(projectDir, "tone-of-voice.md");
}

function buildKanban(tasks, workItems) {
  const columns = {
    backlog: { title: "Backlog", tasks: [] },
    plan: { title: "Plan", tasks: [] },
    progress: { title: "In Progress", tasks: [] },
    review: { title: "Review", tasks: [] },
    done: { title: "Done", tasks: [] },
  };
  const parseList = (value) => {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return String(value)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  };
  const route = (task) => {
    const status = task?.status || task?.state || "";
    const tags = parseList(task?.tags);
    const refs = parseList(task?.vault_refs);
    const normalized = String(status).toLowerCase();
    if (normalized === "archived") return null;
    if (["done", "closed", "complete", "completed"].includes(normalized)) return "done";
    if (["review", "verify"].includes(normalized) || tags.includes("review")) return "review";
    if (["progress", "in_progress", "running", "blocked", "fail", "failed"].includes(normalized)) return "progress";
    if (tags.includes("plan") || refs.some((ref) => String(ref).toLowerCase().includes("plan"))) return "plan";
    return "backlog";
  };

  for (const task of tasks) {
    const column = route(task);
    if (!column) continue;
    columns[column].tasks.push({
      id: `T-${task.id}`,
      title: task.title || task.text || "Untitled task",
      description: task.description || "",
      priority: task.priority || "mid",
      project: task.project_id || "one",
      due: task.due || "",
      tags: parseList(task.tags),
      refs: parseList(task.vault_refs),
      parent: task.parent_id || "",
      status: task.status,
      blocked: task.status === "blocked",
    });
  }
  for (const item of workItems.slice(0, 12)) {
    const column = route(item);
    if (!column) continue;
    columns[column].tasks.push({
      id: `W-${item.id}`,
      title: item.title || "Work item",
      description: item.failed_guards ? `${item.failed_guards} failed guards` : "",
      priority: item.failed_guards ? "high" : "mid",
      project: "work",
      tags: item.failed_guards ? ["review"] : [],
      refs: [],
      status: item.state,
      blocked: ["blocked", "fail", "failed"].includes(String(item.state || "").toLowerCase()),
    });
  }
  return columns;
}

function buildDefaultContext(env, project = "one") {
  const projectsRoot = process.env.PROJECTS_ROOT || agentPath("obsidian-vault", "projects");
  const localProjectsRoot = path.isAbsolute(projectsRoot) ? projectsRoot : agentPath(projectsRoot);
  const projectPath = path.join(localProjectsRoot, project);
  const entries = [
    ["$AGENT_ROOT/health/health.status", "system", agentPath("health", "health.status")],
    [`<project>/AGENTS.md`, "project", path.join(projectPath, "AGENTS.md")],
    ["$AGENT_ROOT/agent/LIBRARY.md", "system", agentPath("agent", "LIBRARY.md")],
    ["$AGENT_ROOT/agent/SUBAGENTS.md", "system", agentPath("agent", "SUBAGENTS.md")],
    ["$AGENT_ROOT/agent/SERVICE_REGISTRY.md", "system", agentPath("agent", "SERVICE_REGISTRY.md")],
    ["$AGENT_ROOT/agent/SKILLS_INDEX.md", "system", agentPath("agent", "SKILLS_INDEX.md")],
    [`<project>/context.md`, "project", path.join(projectPath, "context.md")],
    [`<project>/state.md`, "project", path.join(projectPath, "state.md")],
    [`<project>/tone-of-voice.md`, "optional", path.join(projectPath, "tone-of-voice.md")],
    ["CORE.md", "system prompt", path.join(projectPath, "CORE.md")],
    [".dirty-files", "dirty reread", path.join(projectPath, ".dirty-files")],
  ];

  return entries.map(([name, type, filePath]) => [
    name,
    type,
    fileExists(filePath) ? "present" : type === "optional" || type === "dirty reread" ? "optional" : "missing",
  ]);
}

const expectedPipelineSteps = [
  "classify",
  "preflight",
  "evidence",
  "synthetic",
  "skill-triggers",
  "content-guard",
  "verify-pending",
  "mcp-router",
  "scheduler",
  "steering",
  "work-items",
];

const pipelineStepInfo = {
  classify: {
    ok: "intent classified; request can enter the pipeline",
    skip: "classification was not required for this path",
  },
  preflight: {
    ok: "basic checks passed before model work",
    skip: "preflight checks were not required",
  },
  evidence: {
    ok: "evidence/context lookup completed",
    skip: "no evidence lookup was needed",
  },
  synthetic: {
    ok: "synthetic context was loaded or refreshed",
    skip: "static synthetic context was already loaded by Read Tracker or not needed",
  },
  "skill-triggers": {
    ok: "a skill trigger matched or the trigger pass completed",
    skip: "no matching skill trigger for this request",
  },
  "content-guard": {
    ok: "content guard checked the request",
    skip: "guard pass was not triggered for this request",
  },
  "verify-pending": {
    ok: "pending verification items were checked",
    skip: "no pending verification items",
  },
  "mcp-router": {
    ok: "tool/service routing was evaluated",
    skip: "no MCP/service route was requested",
  },
  scheduler: {
    ok: "scheduler state was checked or updated",
    skip: "no scheduled/deferred job for this turn",
  },
  steering: {
    ok: "response steering was applied",
    skip: "no extra steering action was needed",
  },
  "work-items": {
    ok: "work item state was checked or updated",
    skip: "no work item action was needed",
  },
};

function pipelineStepTitle(row) {
  const status = row.status === "error" || row.status === "fail" ? "fail" : row.status || "skip";
  const fromTrace = row.error
    ? `trace error: ${row.error}`
    : row.reason
      ? `reason: ${row.reason}${row.details_json ? ` · details: ${row.details_json}` : ""}`
      : pipelineStepInfo[row.step]?.[status] || pipelineStepInfo[row.step]?.ok || "pipeline step recorded";
  const preview = row.message_preview ? `user query: ${row.message_preview}` : "user query: not recorded";
  return `${row.step}: ${status}${row.duration_ms !== null && row.duration_ms !== undefined ? ` · ${row.duration_ms}ms` : ""}\n${fromTrace}\nsource: traces.db · scope=${row.trace_scope || "legacy"}\n${preview}`;
}

function semanticPipelineTitle(step, status, durationMs, userQuery = "") {
  const normalized = status === "error" || status === "fail" ? "fail" : status || "skip";
  const meaning =
    pipelineStepInfo[step]?.[normalized] ||
    pipelineStepInfo[step]?.ok ||
    (normalized === "skip" ? "step was skipped by pipeline rules" : "pipeline step recorded");
  const timing = durationMs ? ` · ${durationMs}ms` : "";
  const query = userQuery ? `\nuser query: ${userQuery}` : "";
  if (String(userQuery).includes("\n")) return userQuery;
  return `${step}: ${normalized}${timing}\n${meaning}\nsource: traces.db${query}`;
}

function summarizeDefaultContext(rows) {
  const present = rows.filter((row) => row[2] === "present").length;
  const optional = rows.filter((row) => row[2] === "optional").length;
  const missing = rows.filter((row) => row[2] === "missing").length;
  return {
    present,
    optional,
    missing,
    total: rows.length,
    title: `${present}/${rows.length} present · static synthetic reads, loaded once per session by Read Tracker`,
  };
}

function summarizeLatestRun(usage) {
  const latest = usage.latest || {};
  const sessionId = latest.sessionId || "session";
  const entries = usage.entries.filter((entry) => (entry.sessionId || "session") === sessionId);
  const turns = groupUsageTurns(entries, 100).sort((a, b) => {
    const left = Number(String(a.turnId).match(/\d+/)?.[0] || 0);
    const right = Number(String(b.turnId).match(/\d+/)?.[0] || 0);
    return left - right;
  });
  const totals = entries.reduce(
    (acc, entry) => {
      acc.input += Number(entry.in || 0);
      acc.output += Number(entry.out || 0);
      acc.cacheRead += Number(entry.cacheRead || 0);
      acc.total += Number(entry.total || 0);
      acc.records += 1;
      return acc;
    },
    { input: 0, output: 0, cacheRead: 0, total: 0, records: 0 },
  );
  return {
    sessionId,
    source: latest.source || turns.at(-1)?.source || "usage",
    model: latest.model || turns.at(-1)?.model || "model",
    firstAt: entries[0] ? parseDate(entries[0].ts) : null,
    lastAt: entries.at(-1) ? parseDate(entries.at(-1).ts) : null,
    turns,
    totals,
  };
}

function buildPipelineStepCards(livePipeline, traceStale, traceReason) {
  const actual = new Map((livePipeline?.steps || []).map((step) => [step[0], step]));
  return expectedPipelineSteps.map((step) => {
    const row = actual.get(step);
    if (row) return [row[0], row[1], row[2], livePipeline?.stepDetails?.[step] || semanticPipelineTitle(row[0], row[1], row[2], row[3])];
    if (traceStale) return [step, "unknown", 0, traceReason];
    return [step, "skip", 0, "step was not recorded in the latest trace run"];
  });
}

function eventId(prefix, index = 0) {
  return `${prefix}-${Date.now()}-${index}`;
}

function buildDashboardEvents({ usage, health, pipeline, doctor, traceStale, traceReason, guards, defaultContextSummary, latestRun }) {
  const events = [];
  const push = (group, type, message, detail, date = new Date(), id = events.length) => {
    events.push({
      id: eventId(group, id),
      time: timeLabel(date),
      group,
      type,
      message,
      detail,
    });
  };

  push(
    "services",
    "ProviderActive",
    `${usage.latest?.provider || "provider"} · ${usage.latest?.model || "model"}`,
    `source=${usage.latest?.source || "unknown"} · session=${usage.latest?.sessionId || "n/a"}`,
    parseDate(usage.latest?.ts) || new Date(),
  );
  push(
    health.fail ? "issue" : health.warn ? "issue" : "services",
    "HealthStatus",
    `health ${health.ok}/${health.warn}/${health.fail}`,
    `status=${health.status} · updated=${formatAge(health.timestamp)}`,
    health.timestamp || new Date(),
  );
  push(
    pipeline.status === "ok" ? "state" : "issue",
    "PipelineRollup",
    `daily rollup ${pipeline.status}`,
    `last=${formatAge(pipeline.lastRun)} · duration=${pipeline.durationMs || 0}ms`,
    pipeline.lastRun || pipeline.updated || new Date(),
  );
  push(
    doctor.status === "ok" ? "guard" : "issue",
    "DoctorScore",
    `doctor ${doctor.score || 0} · ${doctor.trend}`,
    `core=${doctor.coreSize}/${doctor.coreCap} · issues=${doctor.issues.length}`,
    doctor.updated || new Date(),
  );
  push(
    traceStale ? "issue" : "tool",
    traceStale ? "TraceUnavailable" : "TraceLinked",
    traceStale ? "turn pipeline trace unavailable" : "turn pipeline trace linked",
    traceReason,
  );
  push(
    "context",
    "DefaultContext",
    `${defaultContextSummary.present}/${defaultContextSummary.total} synthetic context files`,
    defaultContextSummary.title,
  );

  for (const [name, status, title] of guards.slice(0, 6)) {
    push(status === "pass" ? "guard" : "issue", "GuardCheck", `${name} ${status}`, title);
  }

  const latestTurnEntries = usage.lastTurnEntries.length ? usage.lastTurnEntries : usage.entries.slice(-8);
  for (const [index, entry] of latestTurnEntries.slice(-12).entries()) {
    const group = entry.subagent ? "subagents" : entry.skill ? "skills" : "tool";
    const type = entry.subagent ? "SubagentUsage" : entry.skill ? "SkillLoaded" : `UsageStep:${entry.step ?? index}`;
    const label = entry.skill ? `${entry.skill} · ${entry.model || "model"}` : `${entry.source || "usage"} · ${entry.model || "model"}`;
    push(
      group,
      type,
      label,
      `${compactNumber(entry.in)} input · ${compactNumber(entry.out)} output · ${compactNumber(entry.cacheRead)} cache · turn=${entry.turnId || "n/a"}`,
      parseDate(entry.ts) || new Date(),
      index,
    );
  }

  for (const turn of (latestRun?.turns || []).slice(-5)) {
    push(
      "agent",
      "TurnInRun",
      `${turn.turnId} · ${turn.steps} model steps`,
      `${compactNumber(turn.input)} input · ${compactNumber(turn.output)} output · ${compactNumber(turn.cacheRead)} cache`,
      turn.lastAt || new Date(),
    );
  }

  for (const [index, entry] of readRecentDialogMessages(10).entries()) {
    const content = String(entry.content || "").replace(/\s+/g, " ").trim();
    push(
      "message",
      entry.role === "user" ? "MessageReceived" : "MessageSent",
      `${entry.role} · ${content.slice(0, 96)}${content.length > 96 ? "..." : ""}`,
      `session=${entry.run_id || entry.runId || "n/a"} · turn=${entry.turn_id || "n/a"} · source=${entry.filePath}`,
      parseDate(entry.timestamp) || new Date(),
      index,
    );
  }

  push("skills", "SkillIndex", "skills index available", "SKILLS_INDEX.md participates in default synthetic context");
  push("state", "DashboardSnapshot", "summary refreshed", "polling snapshot from local dashboard adapter");

  return events.sort((a, b) => a.time.localeCompare(b.time)).slice(-80);
}

function latestTracePipeline(trace) {
  if (!trace.rows.length) return null;
  const latestRunId = trace.rows[0].run_id;
  const rows = trace.rows.filter((row) => row.run_id === latestRunId).reverse();
  return {
    runId: latestRunId,
    time: timeLabel(rows[0]?.timestamp || trace.latestDate),
    intent: rows[0]?.intent || rows[0]?.project || "pipeline",
    project: rows[0]?.project || "one",
    status: rows.some((row) => row.status === "error" || row.status === "fail") ? "error" : rows.some((row) => row.status === "warn") ? "warn" : "ok",
    durationMs: rows.reduce((sum, row) => sum + Number(row.duration_ms || 0), 0),
    stepDetails: Object.fromEntries(rows.map((row) => [row.step, pipelineStepTitle(row)])),
    userQuery: rows.find((row) => row.message_preview)?.message_preview || "",
    sessionId: rows[0]?.session_id || "",
    turnId: rows[0]?.turn_id || "",
    steps: rows.map((row) => [
      row.step,
      row.status === "error" || row.status === "fail" ? "fail" : row.status || "skip",
      Number(row.duration_ms || 0),
      row.error || `${row.project || "one"} · ${row.intent || "unknown"}`,
    ]),
  };
}

function latestTurnTracePipeline(trace, latestUsage = {}) {
  if (!trace.rows.length) return null;
  const turnRows = trace.rows.filter((row) => row.trace_scope === "turn" && row.session_id && row.turn_id);
  let rows = [];
  let binding = "";

  if (latestUsage.sessionId && latestUsage.turnId) {
    rows = turnRows.filter((row) => row.session_id === latestUsage.sessionId && row.turn_id === latestUsage.turnId);
    if (rows.length) binding = `${latestUsage.sessionId}:${latestUsage.turnId}`;
  }

  if (!rows.length && turnRows.length) {
    const latest = turnRows[0];
    rows = turnRows.filter((row) => row.session_id === latest.session_id && row.turn_id === latest.turn_id);
    binding = `${latest.session_id}:${latest.turn_id}`;
  }

  if (!rows.length) return latestTracePipeline(trace);

  rows = rows.slice().reverse();
  return {
    runId: binding,
    time: timeLabel(rows[0]?.timestamp || trace.latestDate),
    intent: rows[0]?.intent || rows[0]?.project || "pipeline",
    project: rows[0]?.project || "one",
    status: rows.some((row) => row.status === "error" || row.status === "fail") ? "error" : rows.some((row) => row.status === "warn") ? "warn" : "ok",
    durationMs: rows.reduce((sum, row) => sum + Number(row.duration_ms || 0), 0),
    stepDetails: Object.fromEntries(rows.map((row) => [row.step, pipelineStepTitle(row)])),
    userQuery: rows.find((row) => row.message_preview)?.message_preview || "",
    sessionId: rows[0]?.session_id || "",
    turnId: rows[0]?.turn_id || "",
    steps: rows.map((row) => [
      row.step,
      row.status === "error" || row.status === "fail" ? "fail" : row.status || "skip",
      Number(row.duration_ms || 0),
      row.error || row.message_preview || `${row.trace_scope} · ${row.session_id} · ${row.turn_id}`,
    ]),
  };
}

function buildDashboardSummary() {
  const env = readSelectedEnv();
  const health = readHealth(env);
  const pipeline = readPipeline();
  const doctor = readDoctor();
  const agentStatus = readAgentStatus();
  const evalHarness = readEvalHarness();
  const usage = readUsage();
  const trace = readTraceRows();
  const traceRows = trace.rows;
  const usageTurns = groupUsageTurns(usage.entries, 20);
  const workItems = readWorkItems();
  const tasks = readTasks();
  const guards = readGuards();
  const vaultPath = toLocalAgentPath(env.ASSISTANT_VAULT_DIR, ["obsidian-vault", "projects", "one"]);
  const vault = countMarkdownFiles(vaultPath);
  const memoryAnalysis = readMemoryAnalysis(env, doctor);
  const latestUsage = usage.latest || {};
  const latestRun = summarizeLatestRun(usage);
  const cacheHit = usage.totals.input ? (usage.totals.cacheRead / usage.totals.input) * 100 : 0;
  const corePercent = doctor.coreCap ? (doctor.coreSize / doctor.coreCap) * 100 : 0;
  const latestTurn = usageTurns[0] || {};
  const todayUsage = sumUsageSince(usage.entries, startOfLocalDay());
  const days7Usage = sumUsageSince(usage.entries, new Date(startOfLocalDay().getTime() - 6 * 24 * 60 * 60 * 1000));
  const traceLatestDate = trace.latestDate;
  const traceStale = !traceLatestDate || Date.now() - traceLatestDate.getTime() > 7 * 24 * 60 * 60 * 1000;
  const livePipeline = !traceStale ? latestTurnTracePipeline(trace, latestUsage) : null;
  const boundSessionId = livePipeline?.sessionId || latestUsage.sessionId || "";
  const boundTurnId = livePipeline?.turnId || latestUsage.turnId || "";
  const dialogTurn = boundSessionId && boundTurnId ? readDialogTurn(boundSessionId, boundTurnId) : { userQuery: "", agentResponse: "", entries: [] };
  const footprint = boundSessionId && boundTurnId ? readContextFootprint(boundSessionId, boundTurnId) : null;
  const turnDiagnostics = boundSessionId && boundTurnId ? readDiagnosticsForTurn(boundSessionId, boundTurnId) : [];
  const diagnosticsTools = diagnosticsSummaryRows(turnDiagnostics);
  const footprintPath = agentPath("data", "context-footprint.jsonl");
  const diagnosticsPath = turnDiagnostics[0]?.filePath || path.join(agentRoot, "diagnostics", dialogTurn.chatId || "chat", `${dateLabel(new Date())}.jsonl`);
  const freshnessRows = [
    ["traces.db", traceLatestDate ? dateTimeLabel(traceLatestDate) : "missing", traceStale ? "warn" : "ok", trace.sourcePath],
    ["usage.jsonl", formatAge(statMtime(agentPath("data", "usage.jsonl"))), toneByAge(statMtime(agentPath("data", "usage.jsonl")), 30, 24 * 60), agentPath("data", "usage.jsonl")],
    ["dialog.jsonl", formatAge(statMtime(dialogTurn.filePath)), toneByAge(statMtime(dialogTurn.filePath), 30, 24 * 60), dialogTurn.filePath || "not found"],
    ["context-footprint.jsonl", formatAge(statMtime(footprintPath)), toneByAge(statMtime(footprintPath), 30, 24 * 60), footprintPath],
    ["diagnostics jsonl", formatAge(statMtime(diagnosticsPath)), toneByAge(statMtime(diagnosticsPath), 30, 24 * 60), diagnosticsPath],
    ["health.status", formatAge(statMtime(health.filePath)), toneByAge(statMtime(health.filePath), 26 * 60, 50 * 60), health.filePath],
    ["pipeline-status.json", formatAge(statMtime(agentPath("data", "pipeline-status.json"))), toneByAge(statMtime(agentPath("data", "pipeline-status.json")), 26 * 60, 50 * 60), agentPath("data", "pipeline-status.json")],
    ["doctor-status.json", formatAge(statMtime(agentPath("data", "doctor-status.json"))), toneByAge(statMtime(agentPath("data", "doctor-status.json")), 26 * 60, 50 * 60), agentPath("data", "doctor-status.json")],
    ["guards/index.json", formatAge(statMtime(agentPath("guards", "index.json"))), toneByAge(statMtime(agentPath("guards", "index.json")), 24 * 60, 14 * 24 * 60), agentPath("guards", "index.json")],
  ];
  const cacheHit7 = days7Usage.input ? (days7Usage.cacheRead / days7Usage.input) * 100 : cacheHit;
  const runTokens = latestRun.totals.input + latestRun.totals.output;
  const healthTone = health.fail ? "fail" : health.warn ? "warn" : "ok";
  const pipelineTone = pipeline.status === "ok" ? "ok" : pipeline.status === "fail" ? "fail" : "warn";
  const doctorTone = doctor.score >= 85 ? "ok" : doctor.score >= 75 ? "warn" : "fail";
  const totalTurnTokens = runTokens || usage.turnTotals.input + usage.turnTotals.output;
  const traceReason = traceLatestDate
    ? `trace source ${path.relative(agentRoot, trace.sourcePath) || trace.sourcePath}, latest ${dateTimeLabel(traceLatestDate)}`
    : `fresh trace db not copied; expected ${path.join(process.env.HOME || "", ".agent", "traces.db")} or AGENT_DATA_DIR/traces.db`;

  const gitCommit = (() => {
    try {
      return execFileSync("git", ["-C", agentRoot, "log", "-1", "--pretty=%h %s"], {
        encoding: "utf8",
        timeout: 1200,
        windowsHide: true,
      }).trim();
    } catch {
      return "git unavailable";
    }
  })();

  const attention = [];
  if (health.warn || health.fail) {
    attention.push([
      healthTone,
      `Health: ok=${health.ok} warn=${health.warn} fail=${health.fail}`,
      `источник: ${path.relative(agentRoot, health.filePath) || "health.status"}`,
    ]);
  }
  if (traceStale) {
    attention.push(["warn", `Trace Store устарел: ${dateTimeLabel(traceLatestDate)}`, "пока используем usage.jsonl как свежий слой телеметрии"]);
  }
  for (const item of workItems.filter((i) => i.state !== "done" && i.state !== "archived").slice(0, 3)) {
    attention.push([item.failed_guards && item.failed_guards.length ? "fail" : "warn", item.title || "Work item", `state=${item.state || "open"}`]);
  }
  for (const issue of doctor.issues.slice(0, 2)) {
    attention.push(["warn", "Doctor issue", String(issue)]);
  }

  const enrichedGuards = [
    evalHarness.total
      ? [
          "eval-harness",
          evalHarness.status === "pass" && evalHarness.fail === 0 ? "pass" : "fail",
          [
            `${evalHarness.pass}/${evalHarness.total} PASS`,
            `expected_fail: ${evalHarness.expectedFail}`,
            evalHarness.detectors ? `detectors: ${evalHarness.detectors}` : null,
            evalHarness.ts ? `ts: ${dateTimeLabel(evalHarness.ts)}` : null,
            evalHarness.note || null,
            evalHarness.ratchetPolicy || null,
            `source: ${path.relative(agentRoot, evalHarness.filePath) || evalHarness.filePath}`,
          ]
            .filter(Boolean)
            .join(" · "),
        ]
      : ["eval-harness", "fail", `eval-harness-status.json not found · source: ${path.relative(agentRoot, evalHarness.filePath) || evalHarness.filePath}`],
    ...guards,
  ];
  guards.splice(0, guards.length, ...enrichedGuards);

  const lastTurnSteps = usage.lastTurnEntries.length
    ? usage.lastTurnEntries.slice(0, 9).map((entry, index) => [
        entry.step !== undefined ? `step_${entry.step}` : `usage_${index + 1}`,
        Number(entry.total || 0) > 0 ? "ok" : "skip",
        0,
        `${compactNumber(entry.in)} input · ${compactNumber(entry.out)} output · ${compactNumber(entry.cacheRead)} cache`,
      ])
    : [["usage-log", "skip", 0, "usage.jsonl has no turns"]];

  const lastPipelineSteps = buildPipelineStepCards(livePipeline, traceStale, traceReason);
  const lastTurnUserQuery = dialogTurn.userQuery || livePipeline?.userQuery || "";
  const contextSources = footprintSources(footprint, usage.turnTotals);
  const defaultContextRows = buildDefaultContext(env, livePipeline?.project || "one");
  const defaultContextSummary = summarizeDefaultContext(defaultContextRows);

  const status = health.fail ? "error" : health.warn || traceStale ? "warn" : "ok";
  const events = buildDashboardEvents({
    usage,
    health,
    pipeline,
    doctor,
    traceStale,
    traceReason,
    guards,
    defaultContextSummary,
    latestRun,
  });

  const shiftReasons = [];
  const shiftActions = [];
  if (traceStale) {
    shiftReasons.push([
      dateTimeLabel(traceLatestDate),
      "trace store",
      "warn",
      `Trace Store uses stale data: ${traceLatestDate ? dateTimeLabel(traceLatestDate) : "missing"}`,
      "Copy current $AGENT_ROOT/.agent/traces.db locally or set AGENT_TRACE_DB to the real trace database.",
    ]);
    shiftActions.push("Подключить актуальный $AGENT_ROOT/.agent/traces.db или AGENT_TRACE_DB.");
  }
  if (health.warn || health.fail) {
    shiftReasons.push([
      dateTimeLabel(health.timestamp),
      "health.status",
      healthTone,
      `Health checks: ok=${health.ok} warn=${health.warn} fail=${health.fail}`,
      `Проверить ${path.relative(agentRoot, health.filePath) || "health/health.status"} и health updater.`,
    ]);
    shiftActions.push("Обновить health.status / проверить health updater.");
  }
  if (pipelineTone !== "ok") {
    shiftReasons.push([
      dateTimeLabel(pipeline.lastRun),
      "pipeline-status.json",
      pipelineTone,
      `Pipeline rollup is ${pipeline.status}; last run ${formatAge(pipeline.lastRun)}`,
      "Запустить daily rollup / pipeline status job.",
    ]);
    shiftActions.push("Обновить pipeline-status.json свежим rollup.");
  }
  if (doctorTone !== "ok") {
    shiftReasons.push([
      dateTimeLabel(doctor.updated || statMtime(agentPath("data", "doctor-status.json"))),
      "doctor-status.json",
      doctorTone,
      `Doctor score ${doctor.score || 0}, trend ${doctor.trend || "unknown"}`,
      "Проверить doctor-status.json, core size и stale contexts.",
    ]);
  }
  for (const item of workItems.filter((i) => i.state !== "done" && i.state !== "archived").slice(0, 2)) {
    shiftReasons.push([
      dateTimeLabel(parseDate(item.updated_at)),
      "work-items.db",
      item.failed_guards && item.failed_guards.length ? "fail" : "warn",
      item.title || "Open work item",
      `state=${item.state || "open"}`,
    ]);
  }
  const activeShiftReasons = shiftReasons.slice(0, 6);
  const shiftStatus = health.fail ? "fail" : activeShiftReasons.length ? "warn" : "ok";
  const shiftSummary = {
    status: shiftStatus,
    title:
      shiftStatus === "ok"
        ? "OK · критичных причин внимания нет"
        : `${shiftStatus.toUpperCase()} · ${activeShiftReasons.length} причин внимания`,
    copy: activeShiftReasons.length
      ? activeShiftReasons
          .slice(0, 3)
          .map((reason) => reason[3])
          .join(" · ")
      : "Свежие health, usage, pipeline, doctor и trace источники доступны.",
    actions: shiftActions.length ? [...new Set(shiftActions)].slice(0, 4) : ["Ничего срочного: продолжать мониторинг."],
  };

  const tokenKpiTotal = todayUsage.total || days7Usage.total || usage.totals.total;
  const tokenKpiWindow = todayUsage.total ? "\u0441\u0435\u0433\u043e\u0434\u043d\u044f" : days7Usage.total ? "7 \u0434\u043d\u0435\u0439" : "\u0432\u0441\u0435 \u0437\u0430\u043f\u0438\u0441\u0438";
  const tokenKpiCycles = days7Usage.turns.size || usage.totals.requests || 0;
  const tokenKpiDetail = todayUsage.total
    ? `\u0441\u0435\u0433\u043e\u0434\u043d\u044f \u00b7 7 \u0434\u043d\u0435\u0439 ${compactNumber(days7Usage.total)} \u00b7 ${tokenKpiCycles} \u0446\u0438\u043a\u043b\u043e\u0432`
    : `\u0441\u0435\u0433\u043e\u0434\u043d\u044f 0 \u00b7 \u043f\u043e\u043a\u0430\u0437\u0430\u043d\u044b ${tokenKpiWindow} \u00b7 ${tokenKpiCycles} \u0446\u0438\u043a\u043b\u043e\u0432`;
  const dashboardKpis = [
    { label: "Health", value: `${health.ok}/${health.warn}/${health.fail}`, tone: healthTone, detail: `из ${health.total || 0} проверок · ${formatAge(health.timestamp)}`, progress: health.total ? ((health.ok + health.warn * 0.5) / health.total) * 100 : 0 },
    { label: "Pipeline", value: pipeline.status.toUpperCase(), tone: pipelineTone, detail: `daily rollup ${formatAge(pipeline.lastRun)}`, progress: pipeline.status === "ok" ? 100 : 35 },
    { label: "Doctor", value: `${doctor.score || 0} ${doctor.trend === "down" ? "↓" : doctor.trend === "up" ? "↑" : "→"}`, tone: doctorTone, detail: `vault score · ${doctor.trend}`, progress: doctor.score || 0 },
    { label: "\u0422\u043e\u043a\u0435\u043d\u044b", value: compactNumber(tokenKpiTotal), tone: "ok", detail: tokenKpiDetail, progress: clampPercent((tokenKpiTotal / 10_000_000) * 100) },
    { label: "Кэш-хит", value: `${Math.round(cacheHit7)}%`, tone: cacheHit7 > 30 ? "ok" : "warn", detail: "cacheRead / input за 7 дней", progress: clampPercent(cacheHit7) },
  ];

  return {
    live: true,
    sourceRoot: agentRoot,
    passport: {
      provider: env.MODEL_PROVIDER || latestUsage.provider || "unknown",
      model: env.DEEPSEEK_MODEL || latestUsage.model || "unknown",
      fallback: env.FALLBACK_MODEL || "unknown",
      uptime: agentStatus.uptime,
      commit: gitCommit,
    },
    verdict: {
      title:
        status === "ok"
          ? "Агент работает штатно, свежие данные подключены к локальной папке."
          : "Агент работает, но часть источников требует внимания.",
      copy: `Health ${health.ok}/${health.warn}/${health.fail}, doctor ${doctor.score || 0}, pipeline ${pipeline.status}; свежий слой: usage.jsonl от ${dateTimeLabel(usage.latestAt)}.`,
      updated: `срез ${formatAge(new Date())}`,
    },
    shiftSummary,
    attention: attention.slice(0, 6),
    freshness: [
      ["health.status", formatAge(statMtime(health.filePath)), toneByAge(statMtime(health.filePath), 26 * 60, 50 * 60)],
      ["usage.jsonl", formatAge(statMtime(agentPath("data", "usage.jsonl"))), toneByAge(statMtime(agentPath("data", "usage.jsonl")), 30, 24 * 60)],
      ["tasks.db/traces", traceLatestDate ? dateTimeLabel(traceLatestDate) : "нет данных", traceStale ? "warn" : "ok"],
      ["pipeline-status.json", formatAge(statMtime(agentPath("data", "pipeline-status.json"))), toneByAge(statMtime(agentPath("data", "pipeline-status.json")), 26 * 60, 50 * 60)],
      ["doctor-status.json", formatAge(statMtime(agentPath("data", "doctor-status.json"))), toneByAge(statMtime(agentPath("data", "doctor-status.json")), 26 * 60, 50 * 60)],
      ["guards/index.json", formatAge(statMtime(agentPath("guards", "index.json"))), toneByAge(statMtime(agentPath("guards", "index.json")), 24 * 60, 14 * 24 * 60)],
    ],
    freshness: freshnessRows,
    operatorLog: latestDialogLog(),
    lastTurn: {
      label: "Last TURN",
      time: livePipeline?.time || timeLabel(latestRun.lastAt || usage.latestAt),
      runId: livePipeline?.runId || `${latestUsage.sessionId || "session"}:${latestUsage.turnId || "turn"}`,
      intent: livePipeline ? `${livePipeline.project} · ${livePipeline.intent}` : `${latestUsage.source || "usage"} · ${latestUsage.turnId || "turn"} · trace unavailable`,
      status: livePipeline?.status || status,
      duration: livePipeline ? `${livePipeline.durationMs}ms` : `${usage.lastTurnEntries.length || latestTurn.steps || 0} model steps`,
      tools: traceStale ? ["pipeline-trace-unavailable", "turn-usage-analyzed", defaultContextSummary.title] : ["supervisor-trace", "turn-usage-analyzed", defaultContextSummary.title],
      context: {
        inputTokens: usage.turnTotals.input,
        outputTokens: usage.turnTotals.output,
        cachedTokens: usage.turnTotals.cacheRead,
        records: usage.lastTurnEntries.length,
        modelSteps: usage.lastTurnEntries.length,
        cost: "n/a",
        sources: contextSources,
        footprint: footprint
          ? {
              totalChars: footprint.total_chars,
              totalEstTokens: footprint.total_est_tokens,
              usageInputTokens: footprint.usage_input_tokens,
              unexplainedTokens: footprint.unexplained_tokens,
              components: footprint.components?.length || 0,
            }
          : null,
        diagnostics: {
          total: turnDiagnostics.length,
          tools: diagnosticsTools,
        },
      },
      run: null,
      usagePeriods: {
        today: { total: todayUsage.total, input: todayUsage.input, output: todayUsage.output, cacheRead: todayUsage.cacheRead, records: todayUsage.records, turns: todayUsage.turns.size },
        days7: { total: days7Usage.total, input: days7Usage.input, output: days7Usage.output, cacheRead: days7Usage.cacheRead, records: days7Usage.records, turns: days7Usage.turns.size },
      },
      defaultContext: defaultContextRows,
      defaultContextSummary,
      conversation: {
        userQuery: lastTurnUserQuery,
        agentResponse: dialogTurn.agentResponse || "response unavailable in dialog.jsonl for this turn",
        dialogPath: dialogTurn.filePath || "",
      },
      traceDiagnostic: { stale: traceStale, source: trace.sourcePath, latest: traceLatestDate ? dateTimeLabel(traceLatestDate) : "missing", columns: trace.columns, reason: traceReason },
      steps: lastPipelineSteps,
    },
    memory: [
      ["core", `${doctor.coreSize}/${doctor.coreCap}`, corePercent > 80 ? "warn" : "ok", "Размер core-памяти из doctor-status.json."],
      ["vault md", String(vault.total), "ok", `Markdown-файлы в ${vaultPath}.`],
      ["changed today", String(vault.changedToday), vault.changedToday ? "ok" : "warn", "Заметки vault, измененные сегодня."],
      ["last note", vault.latest ? formatAge(vault.latest) : "нет данных", vault.latest ? "ok" : "warn", "Самая свежая markdown-заметка в vault."],
    ],
    memoryAnalysis,
    kpis: dashboardKpis,
    legacyKpis: [
      { label: "Health", value: `${health.ok}/${health.warn}/${health.fail}`, tone: healthTone, detail: `из ${health.total || 0} проверок · ${formatAge(health.timestamp)}`, progress: health.total ? ((health.ok + health.warn * 0.5) / health.total) * 100 : 0 },
      { label: "Pipeline", value: pipeline.status.toUpperCase(), tone: pipelineTone, detail: `daily rollup ${formatAge(pipeline.lastRun)}`, progress: pipeline.status === "ok" ? 100 : 35 },
      { label: "Doctor", value: `${doctor.score || 0} ${doctor.trend === "down" ? "↓" : doctor.trend === "up" ? "↑" : "→"}`, tone: doctorTone, detail: `vault score · ${doctor.trend}`, progress: doctor.score || 0 },
      { label: "Токены", value: compactNumber(usage.totals.total || usage.totals.input + usage.totals.output), tone: "ok", detail: `${usage.totals.requests} записей usage.jsonl`, progress: clampPercent((usage.totals.total / 2_000_000_000) * 100) },
      { label: "Кэш-хит", value: `${Math.round(cacheHit)}%`, tone: cacheHit > 30 ? "ok" : "warn", detail: "cacheRead / input по usage.jsonl", progress: clampPercent(cacheHit) },
    ],
    runs: buildRuns(traceRows, usage.entries, trace.dailyRows || []),
    turns: buildTraceTurns(traceRows, usage.entries),
    errors: activeShiftReasons,
    guards: guards.length ? guards : [["guards/index.json", "fail", "guards/index.json не найден или пуст"]],
    kanban: buildKanban(tasks, workItems),
    events,
  };
}

function sendJson(response, payload, statusCode = 200) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function parseCookies(request) {
  return Object.fromEntries(
    (request.headers.cookie || "")
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const separator = cookie.indexOf("=");
        if (separator === -1) return [cookie, ""];
        return [cookie.slice(0, separator), decodeURIComponent(cookie.slice(separator + 1))];
      }),
  );
}

function credentialsAreValid(user, password) {
  const passwordOk = authPasswordHash ? safeEqual(sha256(password), authPasswordHash) : safeEqual(password, authPassword);
  return safeEqual(user, authUser) && passwordOk;
}

function isAuthorized(request) {
  if (!authEnabled) return true;
  const cookies = parseCookies(request);
  return Boolean(cookies[sessionCookieName]) && safeEqual(cookies[sessionCookieName], sessionToken);
}

function sendLogin(response, error = "") {
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(`<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Agent Dashboard Login</title>
    <style>
      :root { color-scheme: dark; --bg:#080c11; --panel:#131a22; --line:#2b3541; --text:#e8edf2; --muted:#8fa0b1; --warn:#e6ad2e; }
      * { box-sizing: border-box; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; background: linear-gradient(180deg,#0c1117,#080c11); color: var(--text); font-family: "Cascadia Mono", Consolas, monospace; }
      main { width: min(420px, calc(100vw - 32px)); border: 1px solid var(--line); border-radius: 8px; background: var(--panel); padding: 26px; box-shadow: 0 24px 70px rgba(0,0,0,.34); }
      p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
      h1 { margin: 8px 0 20px; font: 700 24px "Segoe UI", sans-serif; }
      label { display: grid; gap: 7px; margin-top: 14px; color: var(--muted); font-size: 11px; text-transform: uppercase; }
      input { width: 100%; min-height: 42px; border: 1px solid var(--line); border-radius: 6px; background: #0b1118; color: var(--text); padding: 0 12px; font: inherit; }
      button { width: 100%; min-height: 42px; margin-top: 18px; border: 1px solid #4b5a6b; border-radius: 6px; background: #17212c; color: var(--text); font: inherit; cursor: pointer; }
      .error { margin-top: 14px; color: var(--warn); }
    </style>
  </head>
  <body>
    <main>
      <p>Agent Operations</p>
      <h1>Dashboard Login</h1>
      <form method="post" action="/login">
        <label>Логин <input name="user" autocomplete="username" autofocus /></label>
        <label>Пароль <input name="password" type="password" autocomplete="current-password" /></label>
        <button type="submit">Войти</button>
      </form>
      ${error ? `<p class="error">${error}</p>` : ""}
    </main>
  </body>
</html>`);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10_000) {
        reject(new Error("Body too large"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function redirect(response, location, headers = {}) {
  response.writeHead(302, { Location: location, ...headers });
  response.end();
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);

  if (authEnabled && request.method === "GET" && url.pathname === "/login") {
    sendLogin(response);
    return;
  }

  if (authEnabled && request.method === "POST" && url.pathname === "/login") {
    try {
      const form = new URLSearchParams(await readBody(request));
      if (credentialsAreValid(form.get("user") || "", form.get("password") || "")) {
        redirect(response, "/", {
          "Set-Cookie": `${sessionCookieName}=${encodeURIComponent(sessionToken)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`,
        });
        return;
      }
      sendLogin(response, "Неверный логин или пароль");
    } catch {
      sendLogin(response, "Не удалось прочитать форму");
    }
    return;
  }

  if (authEnabled && request.method === "POST" && url.pathname === "/logout") {
    redirect(response, "/login", {
      "Set-Cookie": `${sessionCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
    });
    return;
  }

  if (!isAuthorized(request)) {
    redirect(response, "/login");
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/dashboard/summary") {
    try {
      sendJson(response, buildDashboardSummary());
    } catch (error) {
      sendJson(
        response,
        {
          live: false,
          error: error.message || "Could not build dashboard summary",
          sourceRoot: agentRoot,
        },
        500,
      );
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/plans") {
    try {
      sendJson(response, readPlans());
    } catch (error) {
      sendJson(response, { ok: false, error: error.message || "Could not read plans", plans: [] }, 500);
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/plans/update") {
    try {
      const body = JSON.parse((await readBody(request)) || "{}");
      const filePath = safePlanPath(body.id);
      const content = String(body.content || "");
      if (!filePath || !fileExists(filePath) || !content.trim()) {
        sendJson(response, { ok: false, error: "Expected existing markdown plan and non-empty content" }, 400);
        return;
      }
      fs.writeFileSync(filePath, content, "utf8");
      sendJson(response, { ok: true, plan: readPlans().plans.find((plan) => plan.id === path.basename(filePath)) || null });
    } catch (error) {
      sendJson(response, { ok: false, error: error.message || "Could not update plan" }, 400);
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/skills") {
    try {
      sendJson(response, readSkills());
    } catch (error) {
      sendJson(response, { ok: false, error: error.message || "Could not read skills", skills: [] }, 500);
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/skills/update") {
    try {
      const body = JSON.parse((await readBody(request)) || "{}");
      const filePath = safeSkillPath(body.id);
      const content = String(body.content || "");
      if (!filePath || !fileExists(filePath) || !content.trim()) {
        sendJson(response, { ok: false, error: "Expected existing markdown skill and non-empty content" }, 400);
        return;
      }
      fs.writeFileSync(filePath, content, "utf8");
      sendJson(response, { ok: true, skill: readSkills().skills.find((skill) => skill.id === String(body.id).replace(/\\/g, "/")) || null });
    } catch (error) {
      sendJson(response, { ok: false, error: error.message || "Could not update skill" }, 400);
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/projects") {
    try {
      sendJson(response, readProjects());
    } catch (error) {
      sendJson(response, { ok: false, error: error.message || "Could not read projects", projects: [] }, 500);
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/projects/tov/update") {
    try {
      const body = JSON.parse((await readBody(request)) || "{}");
      const filePath = safeProjectTovPath(body.id);
      const content = String(body.content || "");
      if (!filePath || !content.trim()) {
        sendJson(response, { ok: false, error: "Expected project id and non-empty TOV markdown" }, 400);
        return;
      }
      fs.writeFileSync(filePath, content, "utf8");
      sendJson(response, { ok: true, project: readProjects().projects.find((project) => project.id === String(body.id)) || null });
    } catch (error) {
      sendJson(response, { ok: false, error: error.message || "Could not update project TOV" }, 400);
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/tasks") {
    try {
      sendJson(response, readTasks());
    } catch (error) {
      sendJson(response, { ok: false, error: error.message || "Could not read tasks" }, 500);
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/tasks/update") {
    try {
      const body = JSON.parse((await readBody(request)) || "{}");
      const taskId = parseTaskId(body.id);
      const current = taskId ? readTaskById(taskId) : null;
      if (!taskId || !current) {
        sendJson(response, { ok: false, error: "Task not found" }, 404);
        return;
      }
      const column = body.column || "";
      const status = dbStatusForColumn(column, body.status || current.status || "active");
      const tags = tagsForColumn(body.tags, column);
      const dbPath = resolveTasksDbPath();
      executeSqlite(dbPath, (db) => {
        db.prepare(
          `
          update tasks
          set project_id = ?,
              text = ?,
              description = ?,
              status = ?,
              priority = ?,
              due = ?,
              tags = ?,
              parent_id = ?,
              updated_at = datetime('now'),
              updated_by = ?
          where id = ?
          `,
        ).run(
          String(body.project || current.project_id || "one"),
          String(body.title || current.text || ""),
          String(body.description || ""),
          status,
          dbPriorityForTask(body.priority, current.priority),
          body.due ? String(body.due) : null,
          stringifyTaskList(tags),
          body.parent ? String(body.parent) : null,
          "dashboard",
          taskId,
        );
      });
      sendJson(response, { ok: true, task: readTaskById(taskId), dbPath });
    } catch (error) {
      sendJson(response, { ok: false, error: error.message || "Could not update task" }, 400);
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/tasks/move") {
    try {
      const body = JSON.parse((await readBody(request)) || "{}");
      const validStatuses = new Set(["active", "in_progress", "blocked", "done", "archived"]);
      const taskId = parseTaskId(body.id);
      const current = taskId ? readTaskById(taskId) : null;
      const status = dbStatusForColumn(body.column || "", body.status);
      if (!taskId || !current || !validStatuses.has(status)) {
        sendJson(response, { ok: false, error: "Expected id and valid status" }, 400);
        return;
      }
      const tags = tagsForColumn(current.tags, body.column || "");
      const dbPath = resolveTasksDbPath();
      executeSqlite(dbPath, (db) => {
        db.prepare(
          `
          update tasks
          set status = ?,
              tags = ?,
              updated_at = datetime('now'),
              updated_by = ?
          where id = ?
          `,
        ).run(status, stringifyTaskList(tags), body.movedBy || "human", taskId);
      });
      sendJson(response, { ok: true, task: readTaskById(taskId), dbPath });
    } catch (error) {
      sendJson(response, { ok: false, error: error.message || "Could not move task" }, 400);
    }
    return;
  }

  const pipelineMatch = url.pathname.match(/^\/api\/pipeline\/([^/]+)\/([^/]+)$/);
  if (request.method === "POST" && pipelineMatch) {
    const [, taskId, action] = pipelineMatch;
    const validActions = new Set(["plan", "implement", "review", "accept"]);
    if (!validActions.has(action)) {
      sendJson(response, { ok: false, error: "Unknown pipeline action" }, 400);
      return;
    }
    let body = {};
    try {
      body = JSON.parse((await readBody(request)) || "{}");
    } catch {
      body = {};
    }
    sendJson(response, {
      ok: true,
      mode: "mock",
      event: {
        taskId: decodeURIComponent(taskId),
        action,
        title: body.title || "",
        queuedAt: new Date().toISOString(),
        note: "Static pipeline contract accepted; wire GitHub Actions or shell here.",
      },
    });
    return;
  }

  const requestPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(root, requestPath));

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, body) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(body);
  });
});

server.listen(port, process.env.HOST || "127.0.0.1", () => {
  console.log(`Agent dashboard prototype: http://127.0.0.1:${port}`);
  if (authEnabled && !process.env.DASHBOARD_PASSWORD && !process.env.DASHBOARD_PASSWORD_HASH) {
    console.log("Login: admin / change-me");
  }
});
