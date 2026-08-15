/**
 * Agent Core — Evidence Journal (#11)
 *
 * Append-only лог артефактов, найденных в ходе многошаговой работы.
 * Решает проблему «амнезии контекстного окна»: модель собрала 10 источников,
 * но к финалу помнит 3 — журнал гарантирует, что всё дойдёт до ответа.
 *
 * Формат: JSONL (один JSON-объект на строку), append-only.
 * Расположение: <project>/evidence/<session-id>.jsonl
 *
 * Принцип: код запоминает, модель использует.
 */

import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// --- Типы ---

export type EvidenceType = "url" | "fact" | "decision" | "contact" | "error" | "file" | "tool_call";

export interface EvidenceEntry {
  /** ISO-8601 timestamp */
  ts: string;
  /** Тип артефакта */
  type: EvidenceType;
  /** Краткое описание (что найдено/решено) */
  summary: string;
  /** Источник (URL, имя файла, имя инструмента) */
  source?: string;
  /** Детальное содержимое (полный текст факта, сниппет, тело ошибки) */
  content?: string;
  /** Произвольные метаданные */
  meta?: Record<string, unknown>;
}

export interface EvidenceJournal {
  /** Уникальный ID сессии */
  sessionId: string;
  /** Путь к файлу журнала */
  filePath: string;
  /** Количество записей */
  count: number;
}

// --- Глобальный синглтон для авто-захвата инструментами ---

let _globalJournal: EvidenceJournal | null = null;

/** Возвращает или создаёт глобальный журнал для текущего процесса. */
export function getGlobalJournal(sessionId?: string): EvidenceJournal {
  if (!_globalJournal) {
    _globalJournal = createJournal(sessionId);
  } else if (sessionId && _globalJournal.sessionId !== sessionId) {
    // Переключение сессии — создаём новый журнал
    _globalJournal = createJournal(sessionId);
  }
  return _globalJournal;
}

/** Сброс глобального журнала (для тестов и переключения сессий). */
export function resetGlobalJournal(): void {
  _globalJournal = null;
}

/** Быстрая запись в глобальный журнал без явной передачи journal-объекта.
 *  Используется внутри инструментов (web_search, web_fetch) для авто-захвата. */
export function quickAppend(entry: Omit<EvidenceEntry, "ts">): number {
  return appendEntry(getGlobalJournal(), entry);
}

// --- Управление журналом ---

/** Базовая директория для evidence-файлов внутри проекта */
function evidenceDir(projectDir?: string): string {
  const base = projectDir || process.env.ASSISTANT_VAULT_DIR || "vault";
  return join(base, "evidence");
}

/** Создаёт новый журнал для сессии. Возвращает EvidenceJournal. */
export function createJournal(sessionId?: string, projectDir?: string): EvidenceJournal {
  const sid = sessionId || randomUUID();
  const dir = evidenceDir(projectDir);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `${sid}.jsonl`);
  return { sessionId: sid, filePath, count: 0 };
}

/** Добавляет запись в журнал. Возвращает обновлённое количество. */
export function appendEntry(
  journal: EvidenceJournal,
  entry: Omit<EvidenceEntry, "ts">
): number {
  const full: EvidenceEntry = {
    ts: new Date().toISOString(),
    ...entry,
  };
  appendFileSync(journal.filePath, JSON.stringify(full) + "\n", "utf8");
  journal.count++;
  return journal.count;
}

/** Читает все записи журнала. */
export function readJournal(filePath: string): EvidenceEntry[] {
  if (!existsSync(filePath)) return [];
  try {
    const raw = readFileSync(filePath, "utf8").trim();
    if (!raw) return [];
    return raw
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line) as EvidenceEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is EvidenceEntry => e !== null);
  } catch {
    return [];
  }
}

/** Создаёт саммари журнала для подачи модели. */
export function summarizeJournal(filePath: string): string {
  const entries = readJournal(filePath);
  if (entries.length === 0) return "";

  const byType: Record<string, EvidenceEntry[]> = {};
  for (const e of entries) {
    (byType[e.type] ??= []).push(e);
  }

  const lines: string[] = [`[Журнал доказательств: ${entries.length} записей]`];

  const order: EvidenceType[] = ["url", "fact", "decision", "contact", "file", "error", "tool_call"];
  for (const type of order) {
    const group = byType[type];
    if (!group || group.length === 0) continue;
    lines.push(`\n## ${typeLabel(type)} (${group.length})`);
    for (const e of group) {
      const src = e.source ? ` [${e.source}]` : "";
      const content = e.content ? ` — ${truncate(e.content, 200)}` : "";
      lines.push(`- ${e.summary}${src}${content}`);
    }
  }

  return lines.join("\n");
}

/** Создаёт компактный контекст для инжекта в промпт модели. */
export function journalContextHint(filePath: string): string | null {
  const entries = readJournal(filePath);
  if (entries.length === 0) return null;

  const urls = entries.filter((e) => e.type === "url");
  const facts = entries.filter((e) => e.type === "fact");
  const errors = entries.filter((e) => e.type === "error");

  const parts: string[] = [];
  if (urls.length) parts.push(`${urls.length} источников`);
  if (facts.length) parts.push(`${facts.length} фактов`);
  if (errors.length) parts.push(`${errors.length} ошибок`);

  return `[Evidence Journal: ${entries.length} записей (${parts.join(", ")}). Доступен через read_file: ${filePath}]`;
}

// --- Хелперы ---

function typeLabel(type: EvidenceType): string {
  const labels: Record<EvidenceType, string> = {
    url: "🔗 Источники",
    fact: "📌 Факты",
    decision: "✅ Решения",
    contact: "👤 Контакты",
    error: "❌ Ошибки",
    file: "📁 Файлы",
    tool_call: "🔧 Вызовы инструментов",
  };
  return labels[type] || type;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
