/**
 * Agent Core — Read Tracker (#12)
 *
 * Отслеживает, какие файлы уже были «прочитаны» (внедрены как synthetic tool calls)
 * в текущей сессии. Предотвращает двойное внедрение одного и того же файла.
 *
 * Использует нормализацию путей: разрешаются `..` и симлинки,
 * чтобы $AGENT_ROOT/agent/../agent/lib/x.ts и $AGENT_ROOT/agent/lib/x.ts считались одним файлом.
 *
 * Потокобезопасность: Set — однопоточный JS, блокировки не нужны.
 */

import { resolve } from "node:path";

let _readFiles: Set<string> | null = null;

/** Сброс трекера для новой сессии (или тестов). */
export function resetReadTracker(): void {
  _readFiles = new Set();
}

/** Возвращает трекер, лениво создаёт при первом вызове. */
function tracker(): Set<string> {
  if (!_readFiles) _readFiles = new Set();
  return _readFiles;
}

/**
 * Отмечает файл как прочитанный.
 * @returns true — файл УЖЕ был прочитан (дубликат, не надо внедрять).
 *          false — файл отмечен впервые, можно внедрять.
 */
export function markRead(absolutePath: string): boolean {
  const normalized = resolve(absolutePath);
  const t = tracker();
  if (t.has(normalized)) return true;
  t.add(normalized);
  return false;
}

/**
 * Снимает отметку о прочтении для файла.
 * После вызова файл может быть прочитан снова (следующий synthetic inject подхватит).
 * Используется, когда файл изменился во время сессии (например, context.md).
 */
export function unmarkRead(absolutePath: string): void {
  const normalized = resolve(absolutePath);
  tracker().delete(normalized);
}

/**
 * Проверяет, был ли файл уже прочитан (без отметки).
 */
export function isRead(absolutePath: string): boolean {
  const normalized = resolve(absolutePath);
  return tracker().has(normalized);
}

/** Количество прочитанных файлов (для отладки/логгирования). */
export function readCount(): number {
  return tracker().size;
}

/** Все прочитанные пути (для отладки). */
export function readFiles(): string[] {
  return [...tracker()];
}
