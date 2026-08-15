/**
 * Agent Core — Synthetic Reader (#12)
 *
 * Форматирует содержимое файлов как синтетические пары «вызов инструмента → результат».
 * Модель видит их так же, как если бы она сама вызвала read_file и получила ответ.
 *
 * Используется вместе с Read Tracker: файл внедряется один раз за сессию.
 *
 * Формат (из архитектуры ядра агента):
 *   [Tool: read_file] {"path": "/absolute/path"}
 *   [Tool Result]: <содержимое файла>
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { markRead } from "./read-tracker.js";

// Максимальный размер файла для synthetic read (защита от гигантских файлов).
// 100K символов — примерно 25K токенов, укладывается в контекст любой модели.
const MAX_FILE_SIZE = 100_000;

export interface SyntheticRead {
  /** Абсолютный путь к файлу */
  path: string;
  /** Форматированная строка для подачи модели */
  formatted: string;
  /** Размер содержимого (символов), 0 если ошибка */
  size: number;
  /** Код ошибки, если файл не удалось прочитать */
  error?: "not_found" | "too_large" | "read_error";
}

/**
 * Читает файл с диска и форматирует как synthetic tool call.
 * Если файл уже был прочитан (по Read Tracker) — возвращает null.
 */
export function syntheticReadFile(absolutePath: string): SyntheticRead | null {
  const normalized = resolve(absolutePath);

  // Дедубликация
  if (markRead(normalized)) return null;

  let content: string;
  try {
    content = readFileSync(normalized, "utf8");
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { path: normalized, formatted: "", size: 0, error: "not_found" };
    }
    return { path: normalized, formatted: "", size: 0, error: "read_error" };
  }

  if (content.length > MAX_FILE_SIZE) {
    // Обрезаем с предупреждением
    const truncated = content.slice(0, MAX_FILE_SIZE);
    const formatted = formatPair(normalized, truncated, true);
    return { path: normalized, formatted, size: truncated.length, error: "too_large" };
  }

  const formatted = formatPair(normalized, content, false);
  return { path: normalized, formatted, size: content.length };
}

/**
 * Пакетное чтение нескольких файлов.
 * Пропускает уже прочитанные (по Read Tracker).
 * Возвращает массив успешно прочитанных + отформатированных.
 */
export function syntheticReadFiles(paths: string[]): SyntheticRead[] {
  const results: SyntheticRead[] = [];
  for (const p of paths) {
    const r = syntheticReadFile(p);
    if (r) results.push(r);
  }
  return results;
}

/**
 * Объединяет несколько SyntheticRead в одну строку для подачи модели.
 * Разделитель — двойной перевод строки между парами.
 */
export function formatSyntheticBatch(reads: SyntheticRead[]): string {
  if (reads.length === 0) return "";
  return reads.map((r) => r.formatted).filter(Boolean).join("\n\n");
}

// --- Внутренние ---

function formatPair(path: string, content: string, truncated: boolean): string {
  const truncNote = truncated
    ? `\n... (файл обрезан до ${MAX_FILE_SIZE} символов, всего больше)`
    : "";
  return (
    `[Tool: read_file] {"path": "${path}"}\n` +
    `[Tool Result]:\n${content}${truncNote}`
  );
}
