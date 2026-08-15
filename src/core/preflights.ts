/**
 * Agent Core — Preflight Checks (#10)
 *
 * Каскад детерминированных проверок, которые выполняются ДО вызова модели.
 * Первая сработавшая проверка закрывает задачу — модель не вызывается.
 *
 * Принцип: код располагает, модель не нужна (code disposes, no model needed).
 *
 * Внешние зависимости (вне src/core/): ./service-registry.js, ./service-call.js.
 * Это модули реестра self-hosted сервисов реального рантайма — в болванке
 * они отсутствуют, поэтому этот модуль НЕ компилируется сам по себе.
 */

import type { Intent } from "./classifier.js";
import { readFileSync, existsSync } from "node:fs";
import { healthCheckableServices } from "./service-registry.js";
import { checkHealth } from "./service-call.js";

// --- Типы ---

export type PreflightAction = "respond" | "hint" | "pass";

export interface PreflightCheck {
  /** Результат проверки */
  action: PreflightAction;
  /** Если action=respond — текст ответа пользователю */
  response?: string;
  /** Если action=hint — контекстный хинт модели */
  hints?: string[];
}

export interface Preflight {
  name: string;
  /** Возвращает null если проверка не применима */
  check(userText: string, intent: Intent): Promise<PreflightCheck | null>;
}

// --- Реализации ---

/** Путь к health.status: env HEALTH_STATUS_PATH → дефолт $AGENT_ROOT/health/health.status */
function healthStatusPath(): string {
  return process.env.HEALTH_STATUS_PATH || `${process.env.AGENT_ROOT || process.env.IVA_ROOT || "."}/health/health.status`;
}

/**
 * Состояние last-notified для HealthDegradedPreflight.
 * Семантика edge-triggered: предупреждаем ОДИН раз при переходе в degraded-состояние
 * (ok → fail/warn или смена warn↔fail), а не в каждом турне.
 * При возврате к ok состояние сбрасывается — следующий инцидент снова предупредит.
 * Это устраняет шум «Health упоминается в каждом сообщении» при затяжном fail.
 */
let lastNotifiedHealthStatus = "ok";

/** Сброс состояния предупреждений (для тестов и новых сессий). */
export function resetHealthDegradedState(): void {
  lastNotifiedHealthStatus = "ok";
}

/**
 * HealthDegradedPreflight — проверка здоровья системы.
 * Если последняя строка health.status = fail или warn — хинт модели.
 * Не блокирует (action=hint), только информирует.
 * Срабатывает один раз при ПЕРЕХОДЕ в degraded-состояние (не каждый турн).
 */
export const HealthDegradedPreflight: Preflight = {
  name: "health-degraded",

  async check(_userText: string, _intent: Intent): Promise<PreflightCheck | null> {
    try {
      const p = healthStatusPath();
      if (!existsSync(p)) return null;
      const raw = readFileSync(p, "utf8").trim();
      if (raw.length === 0) return null;
      const lines = raw.split("\n");
      // Статус — последняя непустая строка
      let status = "";
      for (let i = lines.length - 1; i >= 0; i--) {
        const s = lines[i].trim();
        if (s.length > 0) { status = s; break; }
      }

      if (status === "fail" || status === "warn") {
        // Уже предупреждали об этом состоянии — молчим (разово за инцидент)
        if (lastNotifiedHealthStatus === status) return null;
        lastNotifiedHealthStatus = status;

        const isFail = status === "fail";
        return {
          action: "hint",
          hints: [
            isFail
              ? "[ВНИМАНИЕ: health.status = FAIL. Критические сервисы недоступны. Сообщи пользователю о проблемах ДО ответа на запрос. Проверь $AGENT_ROOT/health/health.status подробнее.]"
              : "[ВНИМАНИЕ: health.status = WARN. Часть сервисов работает с ошибками. Упомяни это в ответе, если пользователь спрашивает о системе.]",
          ],
        };
      }

      // ok или неизвестный статус — сбрасываем, следующий инцидент снова предупредит
      lastNotifiedHealthStatus = "ok";
    } catch {}

    return null;
  },
};

/**
 * DangerousActionPreflight — опасные действия.
 * Если классификатор пометил запрос как опасный — передаёт хинт модели
 * с требованием использовать security-defense Confirmation Protocol.
 *
 * НЕ возвращает respond: модель получает запрос, но обязана
 * использовать ask_question через security-defense, а не выполнять напрямую.
 *
 * История: раньше preflight возвращал respond (статический текст),
 * но это блокировало модель → security-defense скилл не загружался →
 * ask_question не вызывался → пользователь подтверждал текстом →
 * агент брал не тот запрос из истории.
 */
export const DangerousActionPreflight: Preflight = {
  name: "dangerous-action",

  async check(_userText: string, intent: Intent): Promise<PreflightCheck | null> {
    if (!intent.is_dangerous) return null;

    return {
      action: "hint",
      hints: [
        "[SECURITY: Запрос классифицирован как опасный. НЕ выполняй его напрямую. Загрузи скилл security-defense и используй ask_question с опциями [✅ Выполнить] / [❌ Отмена] для подтверждения. Это единственный разрешённый путь.]",
      ],
    };
  },
};

/** Одиночный символ, который осмыслен: знаки вопроса, восклицания, точки. */
const MEANINGFUL_SINGLE_CHAR = /^[?？！.!！。…]$/u;

/** Только буквы (латиница + кириллица, включая ё/Ё) */
const CONTAINS_LETTER = /[a-zA-Zа-яА-ЯёЁ]/;

/**
 * EmptyInputPreflight — пустой или бессмысленный ввод.
 * Одиночный символ, только пробелы, мусор.
 * Блокирует (action=respond) — нечего обрабатывать.
 */
export const EmptyInputPreflight: Preflight = {
  name: "empty-input",

  async check(userText: string, _intent: Intent): Promise<PreflightCheck | null> {
    const trimmed = userText.trim();

    // 1. Совсем пусто
    if (trimmed.length === 0) {
      return {
        action: "respond",
        response: "Пустое сообщение. Напиши, что нужно сделать.",
      };
    }

    // 2. Одиночный осмысленный знак → pass
    if (trimmed.length === 1 && MEANINGFUL_SINGLE_CHAR.test(trimmed)) {
      return null;
    }

    // 3. Одиночная буква (латиница или кириллица) → pass (может быть ответом)
    if (trimmed.length === 1 && CONTAINS_LETTER.test(trimmed)) {
      return null;
    }

    // 4. Одиночный не-буквенный символ → respond
    if (trimmed.length === 1) {
      return {
        action: "respond",
        response: "Один символ — непонятно, что нужно. Напиши подробнее.",
      };
    }

    // 5. Только не-буквы, ≤5 символов → мусор
    if (trimmed.length <= 5 && !CONTAINS_LETTER.test(trimmed)) {
      return {
        action: "respond",
        response: "Не могу понять этот запрос. Напиши словами, что нужно сделать.",
      };
    }

    return null;
  },
};

// --- Service Health Preflight ---

/**
 * ServiceHealthPreflight — асинхронная проверка self-hosted сервисов.
 * Если сервис с healthEndpoint недоступен — хинт модели (action=hint).
 * Не блокирует выполнение, только информирует.
 *
 * Выполняется параллельно для всех health-checkable сервисов.
 * On-demand сервисы (crawl4ai, n8n) пропускаются — они штатно могут быть остановлены.
 */
export const ServiceHealthPreflight: Preflight = {
  name: "service-health",

  async check(_userText: string, _intent: Intent): Promise<PreflightCheck | null> {
    try {
      const services = healthCheckableServices();
      if (services.length === 0) return null;

      // On-demand сервисы не проверяем — они штатно могут быть остановлены
      const checks = services
        .filter((svc) => !svc.onDemand)
        .map((svc) => checkHealth(svc.name).then((r) => ({ svc, r })));

      // Если после фильтрации не осталось сервисов — выходим
      if (checks.length === 0) return null;

      const results = await Promise.all(checks);

      const failed: string[] = [];
      for (const { svc, r } of results) {
        if (!r.ok || r.data === false) {
          failed.push(`${svc.name} (${svc.description})${r.error ? ": " + r.error : ""}`);
        }
      }

      if (failed.length === 0) return null;

      return {
        action: "hint",
        hints: [
          `[ServiceHealth: ${failed.length} сервис(ов) недоступно: ${failed.join("; ")}. ` +
          `При запросе функциональности этих сервисов — предупреди пользователя и предложи альтернативу.]`,
        ],
      };
    } catch {
      // Preflight упал — молча пропускаем
    }

    return null;
  },
};


// --- Doctor Status Preflight ---

/** Путь к doctor-status.json */
function doctorStatusPath(): string {
  return process.env.DOCTOR_STATUS_PATH || `${process.env.AGENT_ROOT || process.env.IVA_ROOT || "."}/data/doctor-status.json`;
}

interface DoctorStatus {
  status: "ok" | "warn" | "fail";
  issues: string[];
  health_score?: number;
  health_trend?: string;
  core_size?: number;
  core_cap?: number;
}

/**
 * DoctorStatusPreflight — проверка результатов ночного doctor.
 * Если doctor нашёл проблемы (fail/warn) — хинт модели.
 */
export const DoctorStatusPreflight: Preflight = {
  name: "doctor-status",

  async check(_userText: string, _intent: Intent): Promise<PreflightCheck | null> {
    try {
      const p = doctorStatusPath();
      if (!existsSync(p)) return null;
      const raw = readFileSync(p, "utf8");
      const data: DoctorStatus = JSON.parse(raw);

      if (data.status === "fail") {
        const issueList = data.issues.length
          ? data.issues.map((i) => `  - ${i}`).join("\n")
          : "  (нет деталей)";
        let hint = `[DoctorStatus: FAIL. Ночной doctor нашёл критические проблемы:\n${issueList}]`;
        if (data.health_score !== undefined) {
          hint += `\n[Health score: ${data.health_score}/100, тренд: ${data.health_trend || "?"}]`;
        }
        return { action: "hint", hints: [hint] };
      }

      if (data.status === "warn") {
        const issueList = data.issues.map((i) => `  - ${i}`).join("\n");
        return {
          action: "hint",
          hints: [
            `[DoctorStatus: WARN. Ночной doctor нашёл предупреждения:\n${issueList}]`,
          ],
        };
      }

      // ok — pass, ничего не делаем
    } catch {}

    return null;
  },
};

// --- Каскад ---

/** Все preflight-проверки в порядке выполнения.
 *  Первая сработавшая (action !== pass) останавливает каскад. */
const PREFLIGHTS: Preflight[] = [
  EmptyInputPreflight,       // 1. Отсечь мусор
  DangerousActionPreflight,  // 2. Опасные запросы → хинт (не respond!)
  HealthDegradedPreflight,   // 3. Предупредить о проблемах (разово за инцидент)
  ServiceHealthPreflight,    // 4. Проверить self-hosted сервисы
  DoctorStatusPreflight,      // 5. Проверить результаты ночного doctor
];

/**
 * Запускает каскад preflight-проверок.
 * Возвращает первый не-pass результат или { action: "pass" }.
 */
export async function runPreflights(
  userText: string,
  intent: Intent
): Promise<PreflightCheck> {
  for (const preflight of PREFLIGHTS) {
    try {
      const result = await preflight.check(userText, intent);
      if (result && result.action !== "pass") {
        return result;
      }
    } catch (error) {
      console.error(`[preflights] ${preflight.name} failed:`, String(error));
      // Preflight упал — пропускаем, не блокируем основной цикл
    }
  }

  return { action: "pass" };
}
