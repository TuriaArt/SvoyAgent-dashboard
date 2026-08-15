/**
 * Scheduler (#4) — управление напоминаниями (reminders).
 *
 * Одноразовые напоминания: пользователь говорит «напомни через час» →
 * модель вызывает createReminder() → запись в БД.
 *
 * Повторяющиеся напоминания: repeat_interval ('daily'/'weekly'/'monthly')
 * — при срабатывании пересчитывается fire_at, статус остаётся pending.
 *
 * Категория 'task_alert': автоматически создаются при установке due у задачи,
 * отменяются при выполнении/архивации задачи.
 *
 * systemd-таймер раз в 15 минут доставляет напоминания фоном.
 * supervisor проверяет due-напоминания на каждом сообщении.
 *
 * Внешняя зависимость: `./db.ts` (общий модуль БД рантайма, вне src/core/).
 */

import { getDb } from "./db.ts";

// ─── Типы ──────────────────────────────────────────────────────────

export type ReminderStatus = "pending" | "fired" | "cancelled";
export type RepeatInterval = "daily" | "weekly" | "monthly";
export type ReminderCategory = "reminder" | "task_alert";

export interface Reminder {
  id: number;
  task_id: number | null;
  text: string;
  fire_at: string;
  status: ReminderStatus;
  created_at: string;
  fired_at: string | null;
  repeat_interval: string | null;
  repeat_until: string | null;
  repeat_count: number | null;
  category: string;
}

export interface CreateReminderInput {
  text: string;
  fire_at: string;       // ISO-8601
  task_id?: number;
  repeat_interval?: RepeatInterval | string;
  repeat_until?: string;
  repeat_count?: number;
  category?: ReminderCategory;
}

// ─── CRUD ──────────────────────────────────────────────────────────

/** Создать напоминание. Возвращает id. */
export function createReminder(input: CreateReminderInput): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO reminders (task_id, text, fire_at, repeat_interval, repeat_until, repeat_count, category)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    input.task_id ?? null,
    input.text,
    input.fire_at,
    input.repeat_interval ?? null,
    input.repeat_until ?? null,
    input.repeat_count ?? null,
    input.category ?? "reminder",
  );
  return Number(result.lastInsertRowid);
}

/** Отменить напоминание (мягко — status = 'cancelled'). */
export function cancelReminder(id: number): boolean {
  const db = getDb();
  const stmt = db.prepare(
    "UPDATE reminders SET status = 'cancelled' WHERE id = ? AND status = 'pending'"
  );
  const result = stmt.run(id);
  return result.changes > 0;
}

/** Отменить все pending напоминания для задачи. */
export function cancelReminderForTask(taskId: number): boolean {
  const db = getDb();
  const stmt = db.prepare(
    "UPDATE reminders SET status = 'cancelled' WHERE task_id = ? AND status = 'pending'"
  );
  const result = stmt.run(taskId);
  return result.changes > 0;
}

/** Получить напоминание по id. */
export function getReminder(id: number): Reminder | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM reminders WHERE id = ?").get(id);
  return (row as Reminder) ?? null;
}

/** Все активные (pending) напоминания, ближайшие first. */
export function listPending(): Reminder[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM reminders WHERE status = 'pending' ORDER BY fire_at ASC")
    .all() as Reminder[];
}

/** Все напоминания (включая fired/cancelled), последние first. */
export function listAll(limit = 20): Reminder[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM reminders ORDER BY created_at DESC LIMIT ?")
    .all(limit) as Reminder[];
}

// ─── Повторение ────────────────────────────────────────────────────

/** Вычислить следующую дату срабатывания на основе интервала. */
export function calcNextFireAt(current: string, interval: string): string {
  const d = new Date(current);
  switch (interval) {
    case "daily":
    case "P1D":
      d.setDate(d.getDate() + 1);
      break;
    case "weekly":
    case "P7D":
      d.setDate(d.getDate() + 7);
      break;
    case "monthly":
    case "P1M":
      d.setMonth(d.getMonth() + 1);
      break;
    default:
      // Если интервал не распознан — +1 день (безопасное падение)
      d.setDate(d.getDate() + 1);
  }
  return d.toISOString();
}

/** Обновить fire_at у напоминания. */
export function updateReminderFireAt(id: number, nextFireAt: string): boolean {
  const db = getDb();
  const stmt = db.prepare(
    "UPDATE reminders SET fire_at = ? WHERE id = ? AND status = 'pending'"
  );
  const result = stmt.run(nextFireAt, id);
  return result.changes > 0;
}

// ─── Ядро: проверка due ────────────────────────────────────────────

/** Напоминания, которые должны были сработать (fire_at <= now), но ещё pending. */
export function getDue(): Reminder[] {
  const db = getDb();
  const now = new Date().toISOString();
  return db
    .prepare(
      "SELECT * FROM reminders WHERE status = 'pending' AND fire_at <= ? ORDER BY fire_at ASC"
    )
    .all(now) as Reminder[];
}

/**
 * Пометить напоминание как fired (или перепланировать, если повторяющееся).
 * Возвращает текст напоминания или null если уже не pending.
 *
 * Для повторяющихся (repeat_interval IS NOT NULL):
 *   - Вычисляется следующая дата срабатывания
 *   - Если repeat_until задан и next > until → fired
 *   - Если repeat_count задан → декремент; 0 → fired
 *   - Иначе → fire_at обновляется, статус остаётся pending
 */
export function fireReminder(id: number): string | null {
  const db = getDb();

  // Читаем напоминание (в одной транзакции с обновлением — через getDb синглтон)
  const reminder = db
    .prepare("SELECT * FROM reminders WHERE id = ? AND status = 'pending'")
    .get(id) as Reminder | undefined;
  if (!reminder) return null;

  // Если повторяющееся — перепланируем
  if (reminder.repeat_interval) {
    const next = calcNextFireAt(reminder.fire_at, reminder.repeat_interval);

    // Проверяем ограничения
    let shouldFinish = false;

    // repeat_until
    if (reminder.repeat_until && next > reminder.repeat_until) {
      shouldFinish = true;
    }

    // repeat_count
    if (!shouldFinish && reminder.repeat_count !== null) {
      const newCount = reminder.repeat_count - 1;
      if (newCount <= 0) {
        shouldFinish = true;
      } else {
        // Декрементируем счётчик и обновляем fire_at
        db.prepare(
          "UPDATE reminders SET repeat_count = ?, fire_at = ? WHERE id = ? AND status = 'pending'"
        ).run(newCount, next, id);
        return reminder.text;
      }
    }

    if (shouldFinish) {
      // Помечаем как fired
      const now = new Date().toISOString();
      db.prepare(
        "UPDATE reminders SET status = 'fired', fired_at = ? WHERE id = ? AND status = 'pending'"
      ).run(now, id);
    } else {
      // Без ограничений — перепланируем бесконечно
      db.prepare(
        "UPDATE reminders SET fire_at = ? WHERE id = ? AND status = 'pending'"
      ).run(next, id);
    }

    return reminder.text;
  }

  // Одноразовое — стандартная логика
  const now = new Date().toISOString();
  const stmt = db.prepare(
    "UPDATE reminders SET status = 'fired', fired_at = ? WHERE id = ? AND status = 'pending'"
  );
  const result = stmt.run(now, id);
  if (result.changes === 0) return null;

  return reminder.text;
}

/**
 * Основная функция: проверяет due-напоминания и возвращает их тексты.
 * Помечает их как fired или перепланирует.
 * Вызывается supervisor'ом на каждом сообщении.
 */
export function checkDue(): string[] {
  const due = getDue();
  const fired: string[] = [];
  for (const r of due) {
    const text = fireReminder(r.id);
    if (text) fired.push(text);
  }
  return fired;
}

/**
 * Форматирует список due-напоминаний для выдачи пользователю.
 * Возвращает null если напоминаний нет.
 */
export function checkDueFormatted(): string | null {
  const fired = checkDue();
  if (fired.length === 0) return null;

  const lines = fired.map((t, i) => `  ${i + 1}. ${t}`);
  return `[Scheduler] Напоминания (${fired.length}):\n${lines.join("\n")}`;
}
