/**
 * Agent Core — MCP Router (#9 Connectors)
 *
 * Управление доступом к MCP-подключениям на уровне проектов.
 * Каждый проект в config.yml может указать секцию `mcp` со списком
 * разрешённых подключений. Если секции нет — проект получает все
 * подключения (обратная совместимость).
 *
 * Архитектура: модель получает хинт с перечнем доступных ей подключений.
 * Это «мягкое» ограничение — модель сама решает, каким инструментам
 * следовать. Жёсткая фильтрация на уровне connection_search — в бэклоге.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// --- Типы ---

export interface McpProjectConfig {
  /** Список разрешённых подключений (имена connection-файлов) */
  allow: string[];
  /** Список запрещённых подключений (опционально) */
  block?: string[];
}

export interface McpRoutingResult {
  /** Имена разрешённых подключений */
  allowed: string[];
  /** Имена запрещённых подключений */
  blocked: string[];
  /** Все известные системе подключения */
  allKnown: string[];
  /** Есть ли явная конфигурация для проекта */
  explicit: boolean;
}

// --- Константы ---

const PROJECTS_BASE = process.env.AGENT_PROJECTS_DIR || process.env.IVA_PROJECTS_DIR || join(process.cwd(), "agent-data", "obsidian-vault", "projects");
const CONNECTIONS_DIR = process.env.AGENT_CONNECTIONS_DIR || process.env.IVA_CONNECTIONS_DIR || join(process.cwd(), "agent-data", "agent", "connections");

/** Все известные MCP-подключения (файлы *.ts в connections/, кроме example и README) */
let _allConnectionsCache: string[] | null = null;

function getAllKnownConnections(): string[] {
  if (_allConnectionsCache) return _allConnectionsCache;
  try {
    const { readdirSync } = require("node:fs");
    const files = readdirSync(CONNECTIONS_DIR) as string[];
    _allConnectionsCache = files
      .filter((f: string) => f.endsWith(".ts") && f !== "example.ts.txt" && f !== "README.md")
      .map((f: string) => f.replace(/\.ts$/, ""));
    return _allConnectionsCache;
  } catch {
    _allConnectionsCache = [];
    return [];
  }
}

// --- Парсинг config.yml ---

/**
 * Выдирает секцию `mcp:` из YAML-строки простым парсером.
 * Не тянет полноценный YAML-парсер ради пары строк.
 */
function parseMcpSection(raw: string): McpProjectConfig | null {
  const lines = raw.split("\n");
  let inMcp = false;
  let inAllow = false;
  let inBlock = false;
  const allow: string[] = [];
  const block: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Ищем начало секции mcp:
    if (trimmed === "mcp:" || trimmed.startsWith("mcp:")) {
      inMcp = true;
      continue;
    }

    if (!inMcp) continue;

    // Выход из mcp при следующей секции верхнего уровня (без отступа)
    if (trimmed.length > 0 && !trimmed.startsWith(" ") && !trimmed.startsWith("-")) {
      break;
    }

    // allow:
    if (trimmed === "allow:" || trimmed.startsWith("allow:")) {
      inAllow = true;
      inBlock = false;
      continue;
    }

    // block:
    if (trimmed === "block:" || trimmed.startsWith("block:")) {
      inBlock = true;
      inAllow = false;
      continue;
    }

    // Элементы списка: "- name"
    if (trimmed.startsWith("- ")) {
      const name = trimmed.slice(2).trim().replace(/^["']|["']$/g, "");
      if (inAllow && name) allow.push(name);
      if (inBlock && name) block.push(name);
    }
  }

  if (allow.length === 0 && block.length === 0) return null;
  return { allow, block: block.length > 0 ? block : undefined };
}

// --- Кеш конфигов ---

const _configCache = new Map<string, McpProjectConfig | null>();

function loadProjectMcpConfig(project: string): McpProjectConfig | null {
  if (_configCache.has(project)) return _configCache.get(project)!;

  const configPath = join(PROJECTS_BASE, project, "config.yml");
  if (!existsSync(configPath)) {
    _configCache.set(project, null);
    return null;
  }

  try {
    const raw = readFileSync(configPath, "utf8");
    const config = parseMcpSection(raw);
    _configCache.set(project, config);
    return config;
  } catch {
    _configCache.set(project, null);
    return null;
  }
}

// --- Публичный API ---

/**
 * Резолвит, какие MCP-подключения доступны проекту.
 *
 * Правила:
 * 1. Если у проекта есть явная секция `mcp.allow` — используются только они.
 * 2. Если есть `mcp.block` — из всех подключений исключаются заблокированные.
 * 3. Если секции `mcp` нет — проект получает ВСЕ подключения (обратная совместимость).
 *
 * @param project — имя проекта (one, two, three, ...)
 * @returns McpRoutingResult с перечнями allowed/blocked/allKnown
 */
export function resolveProjectMcp(project: string): McpRoutingResult {
  const allKnown = getAllKnownConnections();
  const config = loadProjectMcpConfig(project);

  // Нет конфига — возвращаем всё
  if (!config) {
    return { allowed: allKnown, blocked: [], allKnown, explicit: false };
  }

  // Явный allow — только они
  if (config.allow.length > 0) {
    const allowed = config.allow.filter((c) => allKnown.includes(c));
    const blocked = config.block?.filter((c) => allKnown.includes(c)) ?? [];
    return { allowed, blocked, allKnown, explicit: true };
  }

  // Только block — всё кроме заблокированных
  if (config.block && config.block.length > 0) {
    const blocked = config.block.filter((c) => allKnown.includes(c));
    const allowed = allKnown.filter((c) => !blocked.includes(c));
    return { allowed, blocked, allKnown, explicit: true };
  }

  return { allowed: allKnown, blocked: [], allKnown, explicit: false };
}

/**
 * Формирует хинт для модели: какие MCP-подключения доступны в текущем проекте.
 * Вставляется в контекст через supervisor → buildContext.
 *
 * @param project — имя активного проекта
 * @returns строка для вставки в контекст модели, или "" если routing не нужен
 */
export function buildMcpContextHint(project: string): string {
  const routing = resolveProjectMcp(project);

  // Если все подключения доступны и нет явного конфига — хинт не нужен
  if (!routing.explicit && routing.blocked.length === 0) return "";

  const available = routing.allowed.map((c) => `\`${c}\``).join(", ");
  let hint = `[MCP Router #9] В проекте **${project}** доступны MCP-подключения: ${available}.`;

  if (routing.blocked.length > 0) {
    const blocked = routing.blocked.map((c) => `\`${c}\``).join(", ");
    hint += `\nНедоступны: ${blocked}. Не используй connection__search для них и не предлагай пользователю.`;
  }

  hint += `\nИнструменты вызывай через \`connection__<подключение>__<tool>\`.`;
  return hint;
}

/**
 * Очищает внутренний кеш (для тестов и переключения проектов).
 */
export function clearMcpCache(): void {
  _configCache.clear();
  _allConnectionsCache = null;
}
