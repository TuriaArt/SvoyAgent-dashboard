/**
 * Typed Event Bus — типизированная шина событий для агента.
 *
 * Предоставляет TypedEventEmitter с 15 типами событий, глобальный экземпляр
 * eventBus и хелперы для управления sessionId.
 */

import { invariant } from "./invariant.js";

// ── Base ────────────────────────────────────────────────────────────────────

export interface BaseEvent {
  readonly sessionId: string;
  readonly timestamp: string;
}

// ── 15 типов событий ────────────────────────────────────────────────────────

export interface SessionStarted extends BaseEvent {
  readonly type: "SessionStarted";
  readonly agentName: string;
  readonly model: string;
}

export interface SessionEnded extends BaseEvent {
  readonly type: "SessionEnded";
  readonly durationMs: number;
  readonly reason: string;
}

export interface MessageReceived extends BaseEvent {
  readonly type: "MessageReceived";
  readonly text: string;
  readonly chatId: string;
}

export interface MessageSent extends BaseEvent {
  readonly type: "MessageSent";
  readonly text: string;
  readonly chatId: string;
}

export interface AgentThinking extends BaseEvent {
  readonly type: "AgentThinking";
}

export interface AgentResponding extends BaseEvent {
  readonly type: "AgentResponding";
  readonly partial: string;
}

export interface ToolCalled extends BaseEvent {
  readonly type: "ToolCalled";
  readonly toolName: string;
  readonly callId: string;
  readonly args: Record<string, unknown>;
}

export interface ToolResult extends BaseEvent {
  readonly type: "ToolResult";
  readonly toolName: string;
  readonly callId: string;
  readonly durationMs: number;
  readonly success: boolean;
}

export interface ToolError extends BaseEvent {
  readonly type: "ToolError";
  readonly toolName: string;
  readonly callId: string;
  readonly error: string;
  readonly durationMs: number;
}

export interface ContextCompacted extends BaseEvent {
  readonly type: "ContextCompacted";
  readonly tokensBefore: number;
  readonly tokensAfter: number;
  readonly summaryLength: number;
}

export interface ErrorThrown extends BaseEvent {
  readonly type: "ErrorThrown";
  readonly error: string;
  readonly fatal: boolean;
}

export interface WarningLogged extends BaseEvent {
  readonly type: "WarningLogged";
  readonly message: string;
  readonly source: string;
}

export interface StateChanged extends BaseEvent {
  readonly type: "StateChanged";
  readonly key: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
}

export interface MemoryRecall extends BaseEvent {
  readonly type: "MemoryRecall";
  readonly query: string;
  readonly results: number;
  readonly durationMs: number;
}

export interface MemoryStored extends BaseEvent {
  readonly type: "MemoryStored";
  readonly type_: string;
  readonly key: string;
  readonly status: string;
}

// ── EventMap ────────────────────────────────────────────────────────────────

export interface EventMap {
  [key: string]: BaseEvent;
  SessionStarted: SessionStarted;
  SessionEnded: SessionEnded;
  MessageReceived: MessageReceived;
  MessageSent: MessageSent;
  AgentThinking: AgentThinking;
  AgentResponding: AgentResponding;
  ToolCalled: ToolCalled;
  ToolResult: ToolResult;
  ToolError: ToolError;
  ContextCompacted: ContextCompacted;
  ErrorThrown: ErrorThrown;
  WarningLogged: WarningLogged;
  StateChanged: StateChanged;
  MemoryRecall: MemoryRecall;
  MemoryStored: MemoryStored;
}

// ── TypedEventEmitter ───────────────────────────────────────────────────────

type Handler<T> = (data: T) => void;

export class TypedEventEmitter<T extends Record<string, BaseEvent>> {
  private listeners = new Map<keyof T, Set<Handler<T[keyof T]>>>();

  /**
   * Подписаться на событие.
   * Возвращает функцию отписки.
   */
  on<K extends keyof T>(event: K, handler: Handler<T[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as Handler<T[keyof T]>);

    return () => {
      set!.delete(handler as Handler<T[keyof T]>);
    };
  }

  /**
   * Отписаться от события.
   * Кидает invariant если handler не был зарегистрирован.
   */
  off<K extends keyof T>(event: K, handler: Handler<T[K]>): void {
    const set = this.listeners.get(event);
    invariant(set != null, `[TypedEventEmitter] handler for "${String(event)}" is not registered`);
    invariant(
      set.has(handler as Handler<T[keyof T]>),
      `[TypedEventEmitter] handler for "${String(event)}" is not registered`,
    );
    set.delete(handler as Handler<T[keyof T]>);
  }

  /**
   * Синхронно вызвать всех подписчиков события.
   */
  emit<K extends keyof T>(event: K, data: T[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of set) {
      handler(data);
    }
  }
}

// ── Глобальный sessionId ────────────────────────────────────────────────────

let currentSessionId = "";

export function setSessionId(id: string): void {
  currentSessionId = id;
}

export function getSessionId(): string {
  return currentSessionId;
}

/**
 * Создаёт базовую часть данных события: sessionId и timestamp.
 */
export function baseEventData(): { sessionId: string; timestamp: string } {
  return {
    sessionId: getSessionId(),
    timestamp: new Date().toISOString(),
  };
}

// ── Глобальный экземпляр ────────────────────────────────────────────────────

export const eventBus: TypedEventEmitter<EventMap> = new TypedEventEmitter<EventMap>();
