/**
 * Agent Core — Task Classifier (rule-based hybrid, config-driven)
 *
 * Мгновенная (<5ms) классификация намерения пользователя ДО основного цикла агента.
 * Правила проектов загружаются из config.yml каждого проекта.
 * Добавление нового проекта = новый config.yml, без правки кода.
 *
 * ВАЖНО: JavaScript \b не работает с кириллицей. Используем кастомные
 * проверки границ слов (hasWord).
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface Intent {
  kind: "system_command" | "switch_project" | "simple_question" | "complex_task" | "research" | "recap" | "health" | "other";
  project?: string;
  is_dangerous: boolean;
  needs_web: boolean;
  reasoning: string;
}

// --- Типы для правил из конфига ---

interface ProjectClassifierRule {
  project: string;
  primary: string[];
  context: string[];
  curator: string | null;
  isDefault: boolean;
}

// --- Кеш правил (ленивая загрузка) ---

let _rulesCache: ProjectClassifierRule[] | null = null;
const PROJECTS_BASE = process.env.AGENT_PROJECTS_DIR || process.env.IVA_PROJECTS_DIR || join(process.cwd(), "agent-data", "obsidian-vault", "projects");

function loadRules(): ProjectClassifierRule[] {
  if (_rulesCache) return _rulesCache;

  const rules: ProjectClassifierRule[] = [];
  let dirs: string[];
  try {
    dirs = readdirSync(PROJECTS_BASE, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    _rulesCache = rules;
    return rules;
  }

  for (const project of dirs) {
    try {
      const raw = readFileSync(join(PROJECTS_BASE, project, "config.yml"), "utf8");
      const classifier = parseClassifierSection(raw);
      if (classifier && classifier.primary.length > 0) {
        rules.push({
          project,
          primary: classifier.primary,
          context: classifier.context || [],
          curator: classifier.curator || null,
          isDefault: classifier.default === true,
        });
      }
    } catch {
      // проект без classifier-секции — пропускаем
    }
  }

  _rulesCache = rules;
  return rules;
}

/** Сбросить кеш (для тестов) */
export function clearRulesCache(): void {
  _rulesCache = null;
}

// --- Парсер classifier-секции из config.yml (без YAML-зависимости) ---

interface ParsedClassifier {
  primary: string[];
  context?: string[];
  curator?: string;
  default?: boolean;
}

function parseClassifierSection(raw: string): ParsedClassifier | null {
  // Захватываем всё от classifier: до следующего ключа верхнего уровня или конца строки.
  // БЕЗ флага m, чтобы $ означал конец строки, а не конец линии.
  const sectionMatch = raw.match(/classifier:\s*\n((?:(?!\n\w+:)[\s\S])*)/);
  if (!sectionMatch) return null;

  const section = sectionMatch[1];
  const result: ParsedClassifier = { primary: [] };

  result.primary = parseStringArray(section, "primary");
  if (result.primary.length === 0) return null;

  const ctx = parseStringArray(section, "context");
  if (ctx.length > 0) result.context = ctx;

  const curatorMatch = section.match(/^\s*curator:\s*["']?(\w+)["']?\s*$/m);
  if (curatorMatch) result.curator = curatorMatch[1];

  const defaultMatch = section.match(/^\s*default:\s*(true|false)\s*$/m);
  if (defaultMatch) result.default = defaultMatch[1] === "true";

  return result;
}

/** Парсит массив строк из YAML-подобного блока.
 *  Поддерживает flow: key: ["a", "b"] и block: key:\n  - "a"\n  - "b" */
function parseStringArray(section: string, key: string): string[] {
  const flowMatch = section.match(
    new RegExp(`^\\s*${key}:\\s*\\[([^\\]]*)\\]\\s*$`, "m")
  );
  if (flowMatch) {
    return flowMatch[1]
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }

  const blockMatch = section.match(
    new RegExp(`^\\s*${key}:\\s*\\n((?:\\s*-\\s*["'].*?["']\\s*\\n?)+)`, "m")
  );
  if (blockMatch) {
    const items = blockMatch[1].match(/-\\s*["'](.*?)["']/g);
    if (items) {
      return items.map((s) => s.replace(/^-\\s*["']|["']$/g, "").trim());
    }
  }

  return [];
}

// --- Утилиты ---

/** Проверяет, содержит ли строка слово как целое (с кириллицей работает). */
function hasWord(text: string, word: string): boolean {
  const idx = text.indexOf(word);
  if (idx === -1) return false;
  const leftOk = idx === 0 || !isWordChar(text[idx - 1]);
  const rightOk = idx + word.length === text.length || !isWordChar(text[idx + word.length]);
  return leftOk && rightOk;
}

function isWordChar(ch: string): boolean {
  return /[a-zA-Zа-яА-ЯёЁ0-9_]/.test(ch);
}

function hasAnyWord(text: string, words: string[]): boolean {
  return words.some((w) => hasWord(text, w));
}

function containsAny(text: string, substrings: string[]): boolean {
  return substrings.some((s) => text.includes(s));
}

// --- Опасные паттерны ---

// Многословные паттерны (проверяем как подстроку — includes)
const DANGEROUS_PATTERNS: string[] = [
  "rm -rf",
  "drop table",
  "drop database",
  "delete from",
  "chmod 777",
  "format c:",
  "| bash",
  "| sh",
];

// Одиночные слова (проверяем как целое слово — hasWord)
const DANGEROUS_WORDS: string[] = [
  "curl",
  "wget",
  "сбрось", "сбросить", "сбрасыва",
  "удали", "удалить", "удалит",
  "переустанови",
];

// --- Простые вопросы ---

const QUESTION_STARTERS: string[] = [
  "что ", "кто ", "где ", "когда ", "сколько ", "как ", "какой ", "какая ", "какое ", "какие ",
  "почему ", "зачем ", "чей ", "чья ", "чьё ", "чьи ",
  "расскажи ", "объясни ", "опиши ",
];

// --- Research ---

const RESEARCH_PHRASES: string[] = [
  "найди в интернет", "найди в сети",
  "поищи в интернет", "поищи в сети",
  "погугли", "поиск в интернет",
  "search", "web search", "google",
];

// --- Recap ---

const RECAP_PHRASES: string[] = [
  "что я пропустил", "что пропустил", "чего пропустил",
  "как дела", "как там дела", "что там", "как у меня",
  "дайджест", "сводка", "сводку", "итоги", "итог",
];

// --- Медицинские стемы (health context без явного имени проекта) ---
// Используем containsAny (стем-матчинг), а не hasAnyWord,
// потому что «симптом» должно матчить «симптомы», «головна» → «головная» и т.д.

const HEALTH_STEMS: string[] = [
  "болезн", "симптом", "болит", "давлени", "пульс",
  "температур", "головна", "головны",
];

// --- Классификация ---

export async function classifyIntent(text: string): Promise<Intent> {
  const t = text.trim();
  const lower = t.toLowerCase();

  // 1. Системные команды
  if (/^\/(?:help|start|restart|new|health|task|tasks|digest)\b/i.test(t)) {
    return {
      kind: "system_command",
      is_dangerous: false,
      needs_web: false,
      reasoning: "системная команда бота",
    };
  }

  // 2. Опасные действия
  const isDangerous =
    DANGEROUS_PATTERNS.some((s) => lower.includes(s)) ||
    hasAnyWord(lower, DANGEROUS_WORDS);
  if (isDangerous) {
    return {
      kind: "complex_task",
      is_dangerous: true,
      needs_web: false,
      reasoning: "обнаружены опасные паттерны в запросе",
    };
  }

  // 3. Переключение проекта (config-driven)
  const projectHit = detectProject(lower);
  if (projectHit) {
    return {
      kind: "switch_project",
      project: projectHit,
      is_dangerous: false,
      needs_web: false,
      reasoning: `обнаружено обращение к проекту «${projectHit}»`,
    };
  }

  // 4. Health (медицинские стемы, не перехваченные проектом)
  if (containsAny(lower, HEALTH_STEMS)) {
    return {
      kind: "health",
      project: "two",
      is_dangerous: false,
      needs_web: false,
      reasoning: "запрос связан со здоровьем",
    };
  }

  // 5. Research
  if (containsAny(lower, RESEARCH_PHRASES)) {
    return {
      kind: "research",
      needs_web: true,
      is_dangerous: false,
      reasoning: "запрос требует поиска в интернете",
    };
  }

  // 6. Recap
  if (containsAny(lower, RECAP_PHRASES)) {
    return {
      kind: "recap",
      is_dangerous: false,
      needs_web: false,
      reasoning: "пользователь хочет сводку",
    };
  }

  // 7. Простой вопрос vs сложная задача
  const startsWithQuestion = QUESTION_STARTERS.some((s) => lower.startsWith(s));
  const isShort = t.length <= 60;

  if (isShort && startsWithQuestion) {
    return {
      kind: "simple_question",
      is_dangerous: false,
      needs_web: false,
      reasoning: "короткий вопрос, не требующий инструментов",
    };
  }

  // 7b. Вопрос не короткий → сложная задача (требует развёрнутого ответа)
  if (startsWithQuestion && !isShort) {
    return {
      kind: "complex_task",
      is_dangerous: false,
      needs_web: false,
      reasoning: "развёрнутый вопрос, требующий детального ответа",
    };
  }

  // 8. Явные признаки сложной задачи
  const actionVerbs = [
    "напиши", "создай", "сделай", "построй", "настрой",
    "запусти", "установи", "исправь", "почини", "оптимизируй",
    "реализуй", "разработай", "задеплой", "скомпилируй",
    "добавь", "обнови", "измени",
  ];

  if (t.length > 120 || hasAnyWord(lower, actionVerbs)) {
    return {
      kind: "complex_task",
      is_dangerous: false,
      needs_web: false,
      reasoning: "многошаговая задача, требующая инструментов",
    };
  }

  // 9. Default
  return {
    kind: "other",
    is_dangerous: false,
    needs_web: false,
    reasoning: "не классифицировано — fallback на flash",
  };
}

// --- Детект проекта (config-driven) ---

function detectProject(lower: string): string | undefined {
  const rules = loadRules();

  // Найти все правила, где primary-слова совпали с текстом
  const hits = rules.filter((rule) =>
    rule.primary.some((word) => hasWord(lower, word))
  );

  if (hits.length === 0) return undefined;

  // Группируем хиты по куратору
  const byCurator = new Map<string, ProjectClassifierRule[]>();
  for (const hit of hits) {
    const key = hit.curator || hit.project;
    const group = byCurator.get(key) || [];
    group.push(hit);
    byCurator.set(key, group);
  }

  // Для каждой группы куратора:
  for (const [, group] of byCurator) {
    // Один проект у куратора → сразу возвращаем
    if (group.length === 1) return group[0].project;

    // Несколько проектов → disambiguation.
    // Сначала находим primary-слова, общие для всех проектов группы.
    const allPrimaries = group.flatMap((r) => r.primary);
    const sharedWords = new Set(
      allPrimaries.filter(
        (w) => group.filter((r) => r.primary.includes(w)).length > 1
      )
    );

    for (const rule of group) {
      // 1) Проверяем context (стем-матчинг)
      if (rule.context.length > 0 && containsAny(lower, rule.context)) {
        return rule.project;
      }
      // 2) Проверяем уникальные primary-слова (не общие с другими проектами группы)
      const uniquePrimaries = rule.primary.filter((w) => !sharedWords.has(w));
      if (uniquePrimaries.length > 0 && hasAnyWord(lower, uniquePrimaries)) {
        return rule.project;
      }
    }

    // Контекст и уникальные primary не найдены → ищем default
    const defaultRule = group.find((r) => r.isDefault);
    if (defaultRule) return defaultRule.project;

    // Нет default → undefined
  }

  return undefined;
}
