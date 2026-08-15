/**
 * Steering / Follow-up Queue (#5)
 *
 * Позволяет инструментам и субагентам добавлять follow-up задачи,
 * которые будут обработаны моделью в следующем ходе — до ответа пользователю.
 *
 * Принцип: инструмент находит проблему → add("coder: fix lint") →
 * следующий ход начинается с обработки очереди.
 *
 * Потокобезопасность не требуется (один процесс агента).
 */

export interface SteeringItem {
  /** Кто создал (coder, verifier, researcher, …) */
  source: string;
  /** Что нужно сделать модели */
  prompt: string;
  /** Приоритет: high — обработать до ответа пользователю, normal — при возможности */
  priority: "high" | "normal";
  /** Timestamp создания */
  timestamp: number;
}

/** In-memory очередь (живёт пока процесс агента жив) */
let queue: SteeringItem[] = [];

/** Максимальный размер очереди — защита от утечки памяти */
const MAX_QUEUE_SIZE = 20;

/**
 * Добавить follow-up в очередь.
 * Дедупликация: если уже есть item с тем же source+prompt — skip.
 */
export function add(
  source: string,
  prompt: string,
  priority: "high" | "normal" = "normal",
): void {
  // Дедупликация по source + prompt
  const dup = queue.find((q) => q.source === source && q.prompt === prompt);
  if (dup) return;

  // Защита от переполнения
  if (queue.length >= MAX_QUEUE_SIZE) {
    // Удаляем самый старый normal-priority item
    const oldestNormal = queue.findIndex((q) => q.priority === "normal");
    if (oldestNormal >= 0) {
      queue.splice(oldestNormal, 1);
    } else {
      // Все high — удаляем самый старый
      queue.shift();
    }
  }

  queue.push({
    source,
    prompt,
    priority,
    timestamp: Date.now(),
  });
}

/**
 * Извлечь все элементы и очистить очередь.
 * Сортировка: high priority первыми, затем по timestamp.
 */
export function drain(): SteeringItem[] {
  const items = [...queue];
  queue = [];
  // high first, then by timestamp
  items.sort((a, b) => {
    if (a.priority === "high" && b.priority !== "high") return -1;
    if (a.priority !== "high" && b.priority === "high") return 1;
    return a.timestamp - b.timestamp;
  });
  return items;
}

/** Проверить, пуста ли очередь */
export function isEmpty(): boolean {
  return queue.length === 0;
}

/** Очистить очередь (например, при /new) */
export function clear(): void {
  queue = [];
}

/** Есть ли элементы от конкретного источника */
export function hasItemsFromSource(source: string): boolean {
  return queue.some((q) => q.source === source);
}

/** Размер очереди (для тестов и отладки) */
export function size(): number {
  return queue.length;
}

/** Форматировать элементы для инжекта в контекст модели */
export function formatForContext(items: SteeringItem[]): string {
  if (items.length === 0) return "";

  const highItems = items.filter((i) => i.priority === "high");
  const normalItems = items.filter((i) => i.priority === "normal");

  const lines: string[] = [];
  lines.push(
    `[Steering #5] Follow-up queue (${items.length} items). Process these BEFORE responding to the user:`,
  );
  lines.push("");

  if (highItems.length > 0) {
    lines.push("🔴 HIGH priority (must resolve before user response):");
    for (const item of highItems) {
      lines.push(`  [${item.source}] ${item.prompt}`);
    }
    lines.push("");
  }

  if (normalItems.length > 0) {
    lines.push("🟡 NORMAL priority (resolve if possible):");
    for (const item of normalItems) {
      lines.push(`  [${item.source}] ${item.prompt}`);
    }
  }

  return lines.join("\n");
}
