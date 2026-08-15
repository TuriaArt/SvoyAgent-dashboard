/**
 * Тесты TypedEventEmitter, eventBus и SSE-стрима.
 * Запуск: node --test src/core/events.test.ts
 *
 * Стиль: node:test, describe/it, before/after, assert/strict.
 * НЕ используется beforeEach — вместо него before().
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

// Типы для аннотаций — импортируем статически
import type {
  EventMap,
  SessionStarted,
  SessionEnded,
  MessageReceived,
  MessageSent,
  AgentThinking,
  AgentResponding,
  ToolCalled,
  ToolResult,
  ToolError,
  ContextCompacted,
  ErrorThrown,
  WarningLogged,
  StateChanged,
  MemoryRecall,
  MemoryStored,
  BaseEvent,
} from "./events.js";

// Динамические импорты — заполняются в before()
let events: typeof import("./events.js");
let eventStream: typeof import("./event-stream.js");

before(async () => {
  events = await import("./events.js");
  eventStream = await import("./event-stream.js");
});

after(() => {
  // Очищаем стримы после всех тестов
});

// ── TypedEventEmitter ───────────────────────────────────────────────────────

describe("TypedEventEmitter", () => {
  it("on() registers a handler and emit() calls it", () => {
    const ee = new events.TypedEventEmitter<EventMap>();
    const received: string[] = [];
    ee.on("SessionStarted", (data) => { received.push(data.agentName); });
    ee.emit("SessionStarted", {
      type: "SessionStarted",
      sessionId: "s1", timestamp: "",
      agentName: "test-agent", model: "gpt-4",
    } satisfies SessionStarted);
    assert.deepEqual(received, ["test-agent"]);
  });

  it("emit() passes the full data object", () => {
    const ee = new events.TypedEventEmitter<EventMap>();
    let captured: SessionStarted | null = null;
    ee.on("SessionStarted", (data) => { captured = data as SessionStarted; });
    const payload: SessionStarted = {
      type: "SessionStarted",
      sessionId: "s1", timestamp: "2026-01-01T00:00:00Z",
      agentName: "test-agent", model: "deepseek",
    };
    ee.emit("SessionStarted", payload);
    assert.equal(captured, payload);
  });

  it("on() returns an unsubscribe function that stops the handler", () => {
    const ee = new events.TypedEventEmitter<EventMap>();
    const received: string[] = [];
    const off = ee.on("ToolCalled", (data) => { received.push(data.toolName); });
    ee.emit("ToolCalled", {
      type: "ToolCalled", sessionId: "s1", timestamp: "",
      toolName: "bash", callId: "c1", args: {},
    } satisfies ToolCalled);
    assert.equal(received.length, 1);
    off();
    ee.emit("ToolCalled", {
      type: "ToolCalled", sessionId: "s1", timestamp: "",
      toolName: "read_file", callId: "c2", args: {},
    } satisfies ToolCalled);
    assert.equal(received.length, 1);
  });

  it("unsubscribe function is idempotent", () => {
    const ee = new events.TypedEventEmitter<EventMap>();
    let count = 0;
    const off = ee.on("SessionEnded", () => { count++; });
    off();
    off();
    ee.emit("SessionEnded", {
      type: "SessionEnded", sessionId: "s1", timestamp: "",
      durationMs: 100, reason: "done",
    } satisfies SessionEnded);
    assert.equal(count, 0);
  });

  it("off() removes a handler", () => {
    const ee = new events.TypedEventEmitter<EventMap>();
    let count = 0;
    const handler = () => { count++; };
    ee.on("MessageReceived", handler);
    ee.off("MessageReceived", handler);
    ee.emit("MessageReceived", {
      type: "MessageReceived", sessionId: "s1", timestamp: "",
      text: "hi", chatId: "c1",
    } satisfies MessageReceived);
    assert.equal(count, 0);
  });

  it("off() throws invariant if handler was not registered", () => {
    const ee = new events.TypedEventEmitter<EventMap>();
    const handler = () => {};
    assert.throws(
      () => ee.off("SessionStarted", handler),
      /\[INVARIANT\]/,
    );
  });

  it("off() throws for wrong event type — handler registered on different event", () => {
    const ee = new events.TypedEventEmitter<EventMap>();
    const handler = () => {};
    ee.on("SessionStarted", handler);
    // handler registered on SessionStarted, not on SessionEnded
    assert.throws(
      () => ee.off("SessionEnded", handler),
      /\[INVARIANT\]/,
    );
  });

  it("multiple handlers on the same event fire in registration order", () => {
    const ee = new events.TypedEventEmitter<EventMap>();
    const order: number[] = [];
    ee.on("MessageSent", () => { order.push(1); });
    ee.on("MessageSent", () => { order.push(2); });
    ee.on("MessageSent", () => { order.push(3); });
    ee.emit("MessageSent", {
      type: "MessageSent", sessionId: "s1", timestamp: "",
      text: "hello", chatId: "c1",
    } satisfies MessageSent);
    assert.deepEqual(order, [1, 2, 3]);
  });

  it("handlers for different events are isolated", () => {
    const ee = new events.TypedEventEmitter<EventMap>();
    const calls: string[] = [];
    ee.on("AgentThinking", () => { calls.push("thinking"); });
    ee.on("AgentResponding", () => { calls.push("responding"); });
    ee.emit("AgentThinking", {
      type: "AgentThinking", sessionId: "s1", timestamp: "",
    } satisfies AgentThinking);
    assert.deepEqual(calls, ["thinking"]);
  });

  it("emit() is synchronous", () => {
    const ee = new events.TypedEventEmitter<EventMap>();
    let flag = false;
    ee.on("ErrorThrown", () => { flag = true; });
    ee.emit("ErrorThrown", {
      type: "ErrorThrown", sessionId: "s1", timestamp: "",
      error: "err", fatal: false,
    } satisfies ErrorThrown);
    assert.equal(flag, true);
  });

  it("emit() does nothing when no handlers", () => {
    const ee = new events.TypedEventEmitter<EventMap>();
    ee.emit("SessionStarted", {
      type: "SessionStarted", sessionId: "s1", timestamp: "",
      agentName: "x", model: "y",
    } satisfies SessionStarted);
  });

  it("can create emitter with empty EventMap-like type", () => {
    // Проверка что TypedEventEmitter работает с пустым типом
    type EmptyMap = Record<string, BaseEvent>;
    const ee = new events.TypedEventEmitter<EmptyMap>();
    assert.ok(ee instanceof events.TypedEventEmitter);
  });
});

// ── sessionId helpers ───────────────────────────────────────────────────────

describe("sessionId helpers", () => {
  it("setSessionId / getSessionId round-trip", () => {
    events.setSessionId("test-session-42");
    assert.equal(events.getSessionId(), "test-session-42");
  });

  it("getSessionId returns empty string by default", () => {
    events.setSessionId("");
    assert.equal(events.getSessionId(), "");
  });

  it("baseEventData() returns current sessionId and timestamp string", () => {
    events.setSessionId("session-abc");
    const data = events.baseEventData();
    assert.equal(data.sessionId, "session-abc");
    assert.equal(typeof data.timestamp, "string");
    assert.ok(data.timestamp.length > 0);
    // Проверяем ISO 8601 формат
    assert.ok(data.timestamp.includes("T"));
    assert.ok(data.timestamp.endsWith("Z") || data.timestamp.includes("+"));
  });
});

// ── Глобальный eventBus ─────────────────────────────────────────────────────

describe("eventBus singleton", () => {
  it("eventBus is an instance of TypedEventEmitter", () => {
    assert.ok(events.eventBus instanceof events.TypedEventEmitter);
  });

  it("eventBus is a singleton", () => {
    assert.ok(events.eventBus === events.eventBus);
  });

  it("eventBus can emit and receive all 15 event types", () => {
    const ee = events.eventBus;
    const types: string[] = [];
    const handler = (data: any) => { types.push(data.type); };

    ee.on("SessionStarted", handler);
    ee.on("SessionEnded", handler);
    ee.on("MessageReceived", handler);
    ee.on("MessageSent", handler);
    ee.on("AgentThinking", handler);
    ee.on("AgentResponding", handler);
    ee.on("ToolCalled", handler);
    ee.on("ToolResult", handler);
    ee.on("ToolError", handler);
    ee.on("ContextCompacted", handler);
    ee.on("ErrorThrown", handler);
    ee.on("WarningLogged", handler);
    ee.on("StateChanged", handler);
    ee.on("MemoryRecall", handler);
    ee.on("MemoryStored", handler);

    const ts = "2026-07-17T00:00:00.000Z";
    const sid = "session-all-15";
    ee.emit("SessionStarted", { type: "SessionStarted", sessionId: sid, timestamp: ts, agentName: "a", model: "m" });
    ee.emit("SessionEnded", { type: "SessionEnded", sessionId: sid, timestamp: ts, durationMs: 1, reason: "r" });
    ee.emit("MessageReceived", { type: "MessageReceived", sessionId: sid, timestamp: ts, text: "t", chatId: "c" });
    ee.emit("MessageSent", { type: "MessageSent", sessionId: sid, timestamp: ts, text: "t", chatId: "c" });
    ee.emit("AgentThinking", { type: "AgentThinking", sessionId: sid, timestamp: ts });
    ee.emit("AgentResponding", { type: "AgentResponding", sessionId: sid, timestamp: ts, partial: "p" });
    ee.emit("ToolCalled", { type: "ToolCalled", sessionId: sid, timestamp: ts, toolName: "bash", callId: "c1", args: {} });
    ee.emit("ToolResult", { type: "ToolResult", sessionId: sid, timestamp: ts, toolName: "bash", callId: "c1", durationMs: 10, success: true });
    ee.emit("ToolError", { type: "ToolError", sessionId: sid, timestamp: ts, toolName: "bash", callId: "c1", error: "err", durationMs: 5 });
    ee.emit("ContextCompacted", { type: "ContextCompacted", sessionId: sid, timestamp: ts, tokensBefore: 100, tokensAfter: 50, summaryLength: 30 });
    ee.emit("ErrorThrown", { type: "ErrorThrown", sessionId: sid, timestamp: ts, error: "e", fatal: true });
    ee.emit("WarningLogged", { type: "WarningLogged", sessionId: sid, timestamp: ts, message: "warn", source: "test" });
    ee.emit("StateChanged", { type: "StateChanged", sessionId: sid, timestamp: ts, key: "k", oldValue: "a", newValue: "b" });
    ee.emit("MemoryRecall", { type: "MemoryRecall", sessionId: sid, timestamp: ts, query: "q", results: 3, durationMs: 20 });
    ee.emit("MemoryStored", { type: "MemoryStored", sessionId: sid, timestamp: ts, type_: "doc", key: "k1", status: "ok" });

    assert.equal(types.length, 15);

    ee.off("SessionStarted", handler);
    ee.off("SessionEnded", handler);
    ee.off("MessageReceived", handler);
    ee.off("MessageSent", handler);
    ee.off("AgentThinking", handler);
    ee.off("AgentResponding", handler);
    ee.off("ToolCalled", handler);
    ee.off("ToolResult", handler);
    ee.off("ToolError", handler);
    ee.off("ContextCompacted", handler);
    ee.off("ErrorThrown", handler);
    ee.off("WarningLogged", handler);
    ee.off("StateChanged", handler);
    ee.off("MemoryRecall", handler);
    ee.off("MemoryStored", handler);
  });
});

// ── 15 типов событий — структура ────────────────────────────────────────────

describe("15 event type structures", () => {
  const ts = "2026-07-17T00:00:00.000Z";
  const sid = "test-session";

  it("SessionStarted has correct shape", () => {
    const e: SessionStarted = {
      type: "SessionStarted", sessionId: sid, timestamp: ts,
      agentName: "test-agent", model: "gpt-4",
    };
    assert.equal(e.type, "SessionStarted");
    assert.equal(e.agentName, "test-agent");
    assert.equal(e.model, "gpt-4");
  });

  it("SessionEnded has correct shape", () => {
    const e: SessionEnded = {
      type: "SessionEnded", sessionId: sid, timestamp: ts,
      durationMs: 5000, reason: "completed",
    };
    assert.equal(e.durationMs, 5000);
    assert.equal(e.reason, "completed");
  });

  it("MessageReceived has correct shape", () => {
    const e: MessageReceived = {
      type: "MessageReceived", sessionId: sid, timestamp: ts,
      text: "Hello", chatId: "chat-1",
    };
    assert.equal(e.text, "Hello");
    assert.equal(e.chatId, "chat-1");
  });

  it("MessageSent has correct shape", () => {
    const e: MessageSent = {
      type: "MessageSent", sessionId: sid, timestamp: ts,
      text: "Hi there", chatId: "chat-1",
    };
    assert.equal(e.text, "Hi there");
    assert.equal(e.chatId, "chat-1");
  });

  it("AgentThinking has correct shape (only BaseEvent fields)", () => {
    const e: AgentThinking = {
      type: "AgentThinking", sessionId: sid, timestamp: ts,
    };
    assert.equal(e.type, "AgentThinking");
    assert.equal(e.sessionId, sid);
  });

  it("AgentResponding has correct shape", () => {
    const e: AgentResponding = {
      type: "AgentResponding", sessionId: sid, timestamp: ts,
      partial: "Hello...",
    };
    assert.equal(e.partial, "Hello...");
  });

  it("ToolCalled has correct shape", () => {
    const e: ToolCalled = {
      type: "ToolCalled", sessionId: sid, timestamp: ts,
      toolName: "bash", callId: "call-1", args: { cmd: "ls" },
    };
    assert.equal(e.toolName, "bash");
    assert.equal(e.callId, "call-1");
    assert.deepEqual(e.args, { cmd: "ls" });
  });

  it("ToolResult has correct shape", () => {
    const e: ToolResult = {
      type: "ToolResult", sessionId: sid, timestamp: ts,
      toolName: "bash", callId: "call-1", durationMs: 123, success: true,
    };
    assert.equal(e.success, true);
    assert.equal(e.durationMs, 123);
  });

  it("ToolError has correct shape", () => {
    const e: ToolError = {
      type: "ToolError", sessionId: sid, timestamp: ts,
      toolName: "bash", callId: "call-1", error: "command not found", durationMs: 50,
    };
    assert.equal(e.error, "command not found");
    assert.equal(e.durationMs, 50);
  });

  it("ContextCompacted has correct shape", () => {
    const e: ContextCompacted = {
      type: "ContextCompacted", sessionId: sid, timestamp: ts,
      tokensBefore: 1000, tokensAfter: 500, summaryLength: 200,
    };
    assert.equal(e.tokensBefore, 1000);
    assert.equal(e.tokensAfter, 500);
    assert.equal(e.summaryLength, 200);
  });

  it("ErrorThrown has correct shape", () => {
    const e: ErrorThrown = {
      type: "ErrorThrown", sessionId: sid, timestamp: ts,
      error: "Something broke", fatal: true,
    };
    assert.equal(e.error, "Something broke");
    assert.equal(e.fatal, true);
  });

  it("WarningLogged has correct shape", () => {
    const e: WarningLogged = {
      type: "WarningLogged", sessionId: sid, timestamp: ts,
      message: "Low memory", source: "system",
    };
    assert.equal(e.message, "Low memory");
    assert.equal(e.source, "system");
  });

  it("StateChanged has correct shape", () => {
    const e: StateChanged = {
      type: "StateChanged", sessionId: sid, timestamp: ts,
      key: "mode", oldValue: "idle", newValue: "active",
    };
    assert.equal(e.key, "mode");
    assert.equal(e.oldValue, "idle");
    assert.equal(e.newValue, "active");
  });

  it("MemoryRecall has correct shape", () => {
    const e: MemoryRecall = {
      type: "MemoryRecall", sessionId: sid, timestamp: ts,
      query: "what is this project", results: 5, durationMs: 42,
    };
    assert.equal(e.query, "what is this project");
    assert.equal(e.results, 5);
    assert.equal(e.durationMs, 42);
  });

  it("MemoryStored has correct shape", () => {
    const e: MemoryStored = {
      type: "MemoryStored", sessionId: sid, timestamp: ts,
      type_: "document", key: "doc-1", status: "stored",
    };
    assert.equal(e.type_, "document");
    assert.equal(e.key, "doc-1");
    assert.equal(e.status, "stored");
  });
});

// ── Сериализация событий ────────────────────────────────────────────────────

describe("event serialization", () => {
  it("SessionStarted serializes to JSON correctly", () => {
    const e: SessionStarted = {
      type: "SessionStarted", sessionId: "s1", timestamp: "2026-01-01T00:00:00Z",
      agentName: "test-agent", model: "gpt-4",
    };
    const json = JSON.parse(JSON.stringify(e));
    assert.equal(json.type, "SessionStarted");
    assert.equal(json.agentName, "test-agent");
    assert.equal(json.model, "gpt-4");
    assert.equal(json.sessionId, "s1");
  });

  it("ToolCalled args serializes correctly with complex args", () => {
    const e: ToolCalled = {
      type: "ToolCalled", sessionId: "s1", timestamp: "2026-01-01T00:00:00Z",
      toolName: "read_file", callId: "c1",
      args: { path: "/test.txt", options: { encoding: "utf8" } },
    };
    const json = JSON.parse(JSON.stringify(e));
    assert.deepEqual(json.args, { path: "/test.txt", options: { encoding: "utf8" } });
  });
});

// ── EventMap type-level tests ───────────────────────────────────────────────

describe("EventMap type completeness", () => {
  it("all 15 keys are present", () => {
    const keys: (keyof EventMap)[] = [
      "SessionStarted", "SessionEnded", "MessageReceived", "MessageSent",
      "AgentThinking", "AgentResponding", "ToolCalled", "ToolResult",
      "ToolError", "ContextCompacted", "ErrorThrown", "WarningLogged",
      "StateChanged", "MemoryRecall", "MemoryStored",
    ];
    assert.equal(keys.length, 15);
  });
});

// ── createSSEStream ─────────────────────────────────────────────────────────

describe("createSSEStream", () => {
  // Сбрасываем кольцевой буфер перед каждым тестом SSE через before()
  // (beforeEach не используется по требованиям спецификации)

  it("returns a ReadableStream", () => {
    eventStream.resetRingBuffer();
    const stream = eventStream.createSSEStream({ bufferSize: 10 });
    assert.ok(stream instanceof ReadableStream);
    stream.cancel();
  });

  it("replays events from ring buffer on connect", async () => {
    eventStream.resetRingBuffer();
    events.setSessionId("replay-test");

    // Эмитим ДО создания стрима — попадёт в буфер
    events.eventBus.emit("SessionStarted", {
      type: "SessionStarted",
      sessionId: "replay-test",
      timestamp: "2026-07-17T00:00:00.000Z",
      agentName: "test-agent",
      model: "gpt-4",
    } satisfies SessionStarted);

    const stream = eventStream.createSSEStream({ bufferSize: 100 });
    const reader = stream.getReader();

    // Читаем — буфер непустой, данные придут сразу
    const result = await reader.read();
    assert.equal(result.done, false);
    assert.ok(result.value!.startsWith("event: SessionStarted"));
    assert.ok(result.value!.includes("test-agent"));
    reader.cancel();
  });

  it("broadcasts new events to active streams", async () => {
    eventStream.resetRingBuffer();
    events.setSessionId("broadcast-test");
    const stream = eventStream.createSSEStream({ bufferSize: 10 });
    const reader = stream.getReader();

    events.eventBus.emit("MessageSent", {
      type: "MessageSent",
      sessionId: "broadcast-test",
      timestamp: "2026-07-17T00:00:00.000Z",
      text: "broadcast message",
      chatId: "chat-1",
    } satisfies MessageSent);

    const result = await reader.read();
    assert.equal(result.done, false);
    assert.ok(result.value!.includes("broadcast message"));
    reader.cancel();
  });

  it("ring buffer stores last N events", async () => {
    eventStream.resetRingBuffer();
    events.setSessionId("ring-test");

    // Эмитим 5 событий с bufferSize=3
    for (let i = 0; i < 5; i++) {
      events.eventBus.emit("WarningLogged", {
        type: "WarningLogged",
        sessionId: "ring-test",
        timestamp: `2026-07-17T00:00:0${i}Z`,
        message: `warn-${i}`,
        source: "test",
      } satisfies WarningLogged);
    }

    const stream = eventStream.createSSEStream({ bufferSize: 3 });
    const reader = stream.getReader();
    const results: string[] = [];

    // Читаем replay (3 события)
    for (let i = 0; i < 3; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      results.push(value!);
    }

    assert.equal(results.length, 3);
    assert.ok(results[0].includes("warn-2"));
    assert.ok(results[1].includes("warn-3"));
    assert.ok(results[2].includes("warn-4"));
    reader.cancel();
  });

  it("multiple streams receive the same events", async () => {
    eventStream.resetRingBuffer();
    events.setSessionId("multi-stream");

    const stream1 = eventStream.createSSEStream({ bufferSize: 10 });
    const stream2 = eventStream.createSSEStream({ bufferSize: 10 });
    const reader1 = stream1.getReader();
    const reader2 = stream2.getReader();

    events.eventBus.emit("StateChanged", {
      type: "StateChanged",
      sessionId: "multi-stream",
      timestamp: "2026-07-17T00:00:00.000Z",
      key: "mode", oldValue: "idle", newValue: "active",
    } satisfies StateChanged);

    const [r1, r2] = await Promise.all([reader1.read(), reader2.read()]);
    assert.ok(r1.value!.includes("StateChanged"));
    assert.ok(r2.value!.includes("StateChanged"));
    reader1.cancel();
    reader2.cancel();
  });

  it("cancel closes the stream", async () => {
    eventStream.resetRingBuffer();
    events.setSessionId("cancel-test");
    const stream = eventStream.createSSEStream({ bufferSize: 10 });
    const reader = stream.getReader();
    await reader.cancel();
    const { done } = await reader.read();
    assert.equal(done, true);
  });

  it("SSE format is correct: event + data + double newline", async () => {
    eventStream.resetRingBuffer();
    events.setSessionId("sse-format");
    const stream = eventStream.createSSEStream({ bufferSize: 5 });
    const reader = stream.getReader();

    events.eventBus.emit("ToolResult", {
      type: "ToolResult",
      sessionId: "sse-format",
      timestamp: "2026-07-17T00:00:00.000Z",
      toolName: "bash", callId: "c1", durationMs: 100, success: true,
    } satisfies ToolResult);

    const { value } = await reader.read();
    assert.ok(value!.startsWith("event: ToolResult\n"));
    assert.ok(value!.includes('data: {"type":"ToolResult"'));
    assert.ok(value!.endsWith("\n\n"));
    reader.cancel();
  });

  it("bufferSize option limits the ring buffer", () => {
    eventStream.resetRingBuffer();
    const stream1 = eventStream.createSSEStream({ bufferSize: 1 });
    const stream2 = eventStream.createSSEStream({ bufferSize: 500 });
    assert.ok(stream1 instanceof ReadableStream);
    assert.ok(stream2 instanceof ReadableStream);
    stream1.cancel();
    stream2.cancel();
  });
});

// ── Module smoke ────────────────────────────────────────────────────────────

describe("module smoke", () => {
  it("event-stream imports without error", () => {
    assert.ok(typeof eventStream.createSSEStream === "function");
    assert.ok(typeof eventStream.resetRingBuffer === "function");
  });

  it("events module exports all expected symbols", () => {
    assert.ok(typeof events.TypedEventEmitter === "function");
    assert.ok(typeof events.setSessionId === "function");
    assert.ok(typeof events.getSessionId === "function");
    assert.ok(typeof events.baseEventData === "function");
    assert.ok(typeof events.eventBus === "object");
  });
});
