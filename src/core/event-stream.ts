/**
 * SSE-стрим для TypedEventBus.
 *
 * Создаёт ReadableStream в формате Server-Sent Events, который транслирует
 * все события из eventBus. Кольцевой буфер хранит bufferSize последних событий
 * и воспроизводит их при подключении нового стрима.
 *
 * Подписка на eventBus инициализируется при первом импорте модуля и остаётся
 * активной всё время — кольцевой буфер всегда собирает события.
 */

import { eventBus, type BaseEvent, type EventMap } from "./events.js";

// ── Кольцевой буфер ────────────────────────────────────────────────────────

interface RingEntry {
  eventName: keyof EventMap;
  data: BaseEvent;
}

const MAX_BUFFER_SIZE = 100;
const ringBuffer: RingEntry[] = [];
let ringIndex = 0;
let ringCount = 0;

function ringPush(eventName: keyof EventMap, data: BaseEvent): void {
  if (ringCount < MAX_BUFFER_SIZE) {
    ringBuffer.push({ eventName, data });
  } else {
    ringBuffer[ringIndex] = { eventName, data };
  }
  ringIndex = (ringIndex + 1) % MAX_BUFFER_SIZE;
  ringCount++;
}

/**
 * Возвращает до `limit` последних событий в порядке эмита (от старых к новым).
 */
export function getRingBuffer(limit?: number): RingEntry[] {
  const available = Math.min(ringCount, MAX_BUFFER_SIZE);
  if (available === 0) return [];

  const take = Math.min(limit ?? available, available);

  if (ringCount <= MAX_BUFFER_SIZE) {
    // Буфер не переполнен — последние `take` элементов
    return ringBuffer.slice(available - take, available);
  }

  // Кольцевой случай: последние `take` событий
  const result: RingEntry[] = [];
  const start = (ringIndex - take + MAX_BUFFER_SIZE) % MAX_BUFFER_SIZE;
  for (let i = 0; i < take; i++) {
    result.push(ringBuffer[(start + i) % MAX_BUFFER_SIZE]);
  }
  return result;
}

/** Сбросить кольцевой буфер (для тестов). */
export function resetRingBuffer(): void {
  ringBuffer.length = 0;
  ringIndex = 0;
  ringCount = 0;
}

// ── Глобальное управление подписками ───────────────────────────────────────

const activeControllers = new Set<ReadableStreamDefaultController<string>>();

const ALL_EVENT_KEYS: (keyof EventMap)[] = [
  "SessionStarted", "SessionEnded", "MessageReceived", "MessageSent",
  "AgentThinking", "AgentResponding", "ToolCalled", "ToolResult",
  "ToolError", "ContextCompacted", "ErrorThrown", "WarningLogged",
  "StateChanged", "MemoryRecall", "MemoryStored",
];

// Подписка на все события — активна сразу при импорте модуля
for (const key of ALL_EVENT_KEYS) {
  eventBus.on(key, (data) => {
    const entry: BaseEvent = data as unknown as BaseEvent;
    ringPush(key, entry);

    const sseChunk = `event: ${key}\ndata: ${JSON.stringify(entry)}\n\n`;
    for (const controller of activeControllers) {
      try {
        controller.enqueue(sseChunk);
      } catch {
        activeControllers.delete(controller);
      }
    }
  });
}

// ── createSSEStream ─────────────────────────────────────────────────────────

/**
 * Создаёт SSE-стрим, который транслирует события из eventBus.
 *
 * При создании стрима воспроизводит до `bufferSize` последних событий
 * из кольцевого буфера (по умолчанию 100). Стрим живёт до cancel().
 */
export function createSSEStream(options?: { bufferSize?: number }): ReadableStream<string> {
  const replayLimit = options?.bufferSize ?? 100;

  let controllerRef: ReadableStreamDefaultController<string> | null = null;

  const stream = new ReadableStream<string>({
    start(controller) {
      controllerRef = controller;
      activeControllers.add(controller);

      // Replay последних `replayLimit` событий
      const entries = getRingBuffer(replayLimit);
      for (const entry of entries) {
        const sseChunk = `event: ${entry.eventName}\ndata: ${JSON.stringify(entry.data)}\n\n`;
        try {
          controller.enqueue(sseChunk);
        } catch {
          break;
        }
      }
    },
    cancel() {
      if (controllerRef) {
        activeControllers.delete(controllerRef);
        controllerRef = null;
      }
    },
  });

  return stream;
}
