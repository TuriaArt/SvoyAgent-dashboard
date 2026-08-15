/**
 * Trace Store (#10.7) — бортовой журнал пайплайна.
 *
 * Каждый прогон supervisor пишет по одной строке на шаг в таблицу traces.
 * Модуль предоставляет запись и аналитические запросы по трейсам.
 *
 * Внешняя зависимость: `node:sqlite` (требуется Node.js >= 22.5 с включённым
 * экспериментальным sqlite). В болванке без рантайма этот модуль не компилируется
 * и не запускается — оставлен как референс архитектуры.
 */

import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const DB_DIR = process.env.AGENT_DATA_DIR || process.env.IVA_DATA_DIR || join(process.env.HOME || ".", ".agent");
const DB_PATH = join(DB_DIR, "traces.db");

let db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (!db) {
    mkdirSync(DB_DIR, { recursive: true });
    db = new DatabaseSync(DB_PATH);
    db.exec("PRAGMA journal_mode = WAL");

    // Run all migrations
    const migrations = [
      "003_traces.sql",
      "004_traces_message.sql",
      "005_traces_session.sql",
      "006_traces_scope.sql",
      "007_traces_reason.sql",
    ];
    for (const m of migrations) {
      try {
        const sql = readFileSync(
          join(process.cwd(), "agent/migrations", m),
          "utf-8",
        );
        db.exec(sql);
      } catch (e) {
        // Migration already applied or file missing — skip
        console.error(`[trace-store] migration ${m} skipped:`, String(e).slice(0, 80));
      }
    }
  }
  return db;
}

export interface TraceEntry {
  run_id: string;
  project?: string;
  intent?: string;
  step: string;
  status: "ok" | "skip" | "error";
  duration_ms?: number;
  error?: string;
  /** Человекочитаемое объяснение результата шага (dashboard tooltip) */
  reason?: string;
  /** Структурные данные шага: counts, matched skills, route, source files */
  details_json?: string;
  /** First 200 chars of user message for trajectory reconstruction */
  message_preview?: string;
  /** Agent session ID (wrun_...) for turn-level correlation */
  session_id?: string;
  /** Turn ID (turn_N) for turn-level correlation */
  turn_id?: string;
  /**
   * Trace scope:
   *   "turn"    — turn-bound trace (LLM response, has session+turn)
   *   "command" — flash/handled command (no turn, pipeline-only)
   *   undefined — legacy (old persistTrace without scope)
   */
  trace_scope?: string;
}

export function writeTrace(entry: TraceEntry): void {
  try {
    const d = getDb();
    d.prepare(
      `INSERT INTO traces (run_id, project, intent, step, status, duration_ms, error, reason, details_json, message_preview, session_id, turn_id, trace_scope)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      entry.run_id,
      entry.project ?? null,
      entry.intent ?? null,
      entry.step,
      entry.status,
      entry.duration_ms ?? null,
      entry.error ?? null,
      entry.reason ?? null,
      entry.details_json ?? null,
      entry.message_preview ?? null,
      entry.session_id ?? null,
      entry.turn_id ?? null,
      entry.trace_scope ?? null,
    );
  } catch (e) {
    console.error("[trace-store] write error:", e);
  }
}

export function close(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/** Сгенерировать ID прогона. */
export function newRunId(): string {
  return randomUUID();
}

// ─── Чтение трейсов ────────────────────────────────────────────────

interface StepStats {
  step: string;
  total: number;
  ok: number;
  skip: number;
  error: number;
  pct_ok: number;
}

/** Статистика по шагам за последние N дней. */
function getStepStats(days = 7): StepStats[] {
  const d = getDb();
  const rows = d
    .prepare(
      `SELECT step,
              COUNT(*) as total,
              SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) as ok,
              SUM(CASE WHEN status = 'skip' THEN 1 ELSE 0 END) as skip,
              SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error
       FROM traces
       WHERE timestamp >= datetime('now', ?)
       GROUP BY step
       ORDER BY step`,
    )
    .all(`-${days} days`) as any[];

  return rows.map((r: any) => ({
    step: r.step,
    total: r.total,
    ok: r.ok,
    skip: r.skip,
    error: r.error,
    pct_ok: r.total > 0 ? Math.round((r.ok / r.total) * 1000) / 10 : 0,
  }));
}

/** Список ошибок за последние N дней. */
function getRecentErrors(days = 7, limit = 20): Array<{
  timestamp: string;
  step: string;
  error: string;
}> {
  const d = getDb();
  return d
    .prepare(
      `SELECT timestamp, step, error
       FROM traces
       WHERE status = 'error' AND timestamp >= datetime('now', ?)
       ORDER BY timestamp DESC
       LIMIT ?`,
    )
    .all(`-${days} days`, limit) as any[];
}

/** Общее количество прогонов за последние N дней. */
function getRunCount(days = 7): number {
  const d = getDb();
  const row = d
    .prepare(
      `SELECT COUNT(DISTINCT run_id) as cnt
       FROM traces
       WHERE timestamp >= datetime('now', ?)`,
    )
    .get(`-${days} days`) as any;
  return row?.cnt ?? 0;
}

/** Форматировать статистику для показа пользователю. */
export function formatStats(days = 7): string {
  try {
    const stats = getStepStats(days);
    const runs = getRunCount(days);
    const errors = getRecentErrors(days, 5);

    const lines: string[] = [];
    lines.push(`📊 Бортовой журнал за ${days} дн. (прогонов: ${runs})`);
    lines.push("");

    if (stats.length === 0) {
      lines.push("  (пока нет данных)");
      return lines.join("\n");
    }

    for (const s of stats) {
      const icon = s.pct_ok >= 99 ? "🟢" : s.pct_ok >= 90 ? "🟡" : "🔴";
      lines.push(`  ${icon} ${s.step}: ${s.pct_ok}% ok (${s.ok}/${s.total})`);
    }

    if (errors.length > 0) {
      lines.push("");
      lines.push("⚠️ Последние ошибки:");
      for (const e of errors) {
        const ts = e.timestamp.replace("T", " ").slice(0, 19);
        lines.push(`  [${ts}] ${e.step}: ${e.error}`);
      }
    }

    return lines.join("\n");
  } catch (e) {
    return `[trace-store] статистика временно недоступна: ${e}`;
  }
}
