/**
 * Skill Auto-Triggers (#27)
 *
 * Pre-model сканер: по сообщению пользователя определяет, какие скиллы
 * нужно авто-загрузить. Читает секцию ## Auto triggers из тела каждого
 * SKILL.md. Никакого ML — чистый детерминированный матчинг.
 *
 * Принцип: дисциплина ломается, автомат — нет.
 *
 * История: раньше пытались читать auto_trigger из frontmatter, но агент
 * отвергает неизвестные ключи при сборке. Работает только ## Auto triggers
 * в теле. fm.auto_trigger — мёртвый код, удалён (25.07.2026).
 */

import { readFileSync, existsSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join, basename, dirname } from "node:path";

// --- Типы ---

export interface SkillTrigger {
  /** Имя скилла (для load_skill) */
  name: string;
  /** Ключевые слова-триггеры (lowercase) */
  triggers: string[];
  /** Регулярки (опционально, для URL и спец-паттернов) */
  patterns?: RegExp[];
}

export interface ScanResult {
  /** Имена скиллов для авто-загрузки */
  skills: string[];
  /** Для отладки: какие триггеры сработали */
  matched: { skill: string; trigger: string }[];
}

// --- Парсинг YAML frontmatter ---

/**
 * Выдирает frontmatter (между ---) и парсит простой YAML-синтаксис.
 * Нужен только для извлечения name скилла.
 * Триггеры читаются из тела (## Auto triggers), не из frontmatter.
 */
function parseFrontmatter(content: string): Record<string, unknown> {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};

  const result: Record<string, unknown> = {};
  const lines = m[1].split("\n");
  let currentKey: string | null = null;
  let currentArray: string[] = [];
  let inMultiline = false; // true когда мы внутри > или | блока

  for (const line of lines) {
    // Если мы внутри многострочного блока (description: >)
    if (inMultiline) {
      // Проверяем, не начался ли новый ключ или список
      const nextKv = line.match(/^(\w[\w-]*):\s*(.*)/);
      const nextArr = line.match(/^\s+-\s+(.*)/);
      if (nextKv || (nextArr && currentKey)) {
        // Вышли из многострочного блока
        inMultiline = false;
        if (currentArray.length > 0 && currentKey) {
          result[currentKey] = currentArray;
          currentArray = [];
        }
        currentKey = null;
        // Не делаем continue — обрабатываем эту строку ниже
      } else {
        // Всё ещё в многострочном блоке — пропускаем
        continue;
      }
    }

    // Ключ: значение
    const kv = line.match(/^(\w[\w-]*):\s*(.*)/);
    if (kv) {
      // Сохраняем предыдущий массив
      if (currentKey && currentArray.length > 0) {
        result[currentKey] = currentArray;
        currentArray = [];
      }

      const key = kv[1];
      const val = kv[2].trim();

      if (val === ">" || val === ">-" || val === "|") {
        // Многострочное значение — входим в режим пропуска
        inMultiline = true;
        currentKey = null;
        continue;
      }

      if (val === "") {
        // Пустое значение — может быть началом массива на следующих строках
        currentKey = key;
        currentArray = [];
        continue;
      }

      if (val.startsWith("[") && val.endsWith("]")) {
        // Инлайн-массив: [a, b, c]
        result[key] = val
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""));
        currentKey = null;
        currentArray = [];
      } else {
        result[key] = val.replace(/^["']|["']$/g, "");
        currentKey = null;
        currentArray = [];
      }
      continue;
    }

    // Элемент массива: "  - значение"
    const arrItem = line.match(/^\s+-\s+(.*)/);
    if (arrItem && currentKey) {
      const item = arrItem[1].trim().replace(/^["']|["']$/g, "");
      currentArray.push(item);
      continue;
    }
  }

  // Сохраняем последний массив
  if (currentKey && currentArray.length > 0) {
    result[currentKey] = currentArray;
  }

  return result;
}

// --- Поиск SKILL.md файлов ---

const SKILLS_DIR = process.env.AGENT_SKILLS_DIR || process.env.IVA_SKILLS_DIR || join(process.cwd(), "agent-data", "agent", "skills");

function findSkillFiles(): string[] {
  const files: string[] = [];

  try {
    const entries = readdirSync(SKILLS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillMd = join(SKILLS_DIR, entry.name, "SKILL.md");
        if (existsSync(skillMd)) {
          files.push(skillMd);
        }
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(join(SKILLS_DIR, entry.name));
      }
    }
  } catch {
    console.error("[skill-triggers] Cannot read skills directory:", SKILLS_DIR);
  }

  return files;
}

/**
 * Парсит ## Auto triggers из тела SKILL.md.
 * Единственный источник триггеров (фронтматтер не подходит — валидация
 * агента отвергает неизвестные ключи).
 */
function parseBodyTriggers(content: string): string[] {
  const m = content.match(/\n## Auto triggers\s*\n([\s\S]*?)(?=\n## |\n---\n|$)/i);
  if (!m) return [];
  return m[1].split("\n").map((line) => line.match(/^\s*-\s+(.+?)\s*$/)?.[1]?.trim()).filter((x): x is string => Boolean(x));
}

// --- Загрузка триггеров ---

function loadTriggers(): SkillTrigger[] {
  const files = findSkillFiles();
  const triggers: SkillTrigger[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(file, "utf8");
      const fm = parseFrontmatter(content);

      const name = (fm.name as string) || basename(dirname(file) === SKILLS_DIR ? file : dirname(file)).replace(/\.md$/, "");
      const autoTrigger = parseBodyTriggers(content);

      if (!autoTrigger || autoTrigger.length === 0) continue;

      const words: string[] = [];
      const patterns: RegExp[] = [];

      for (const t of autoTrigger) {
        if (t.startsWith("regex:")) {
          // Специальный синтаксис для регулярок
          try {
            patterns.push(new RegExp(t.slice(6), "i"));
          } catch {
            console.error(`[skill-triggers] Invalid regex in ${name}: ${t}`);
          }
        } else {
          words.push(t.toLowerCase());
        }
      }

      triggers.push({ name, triggers: words, patterns: patterns.length > 0 ? patterns : undefined });
    } catch (err) {
      console.error(`[skill-triggers] Error loading ${file}:`, String(err));
    }
  }

  return triggers;
}

// --- Сканирование ---

/** Кеш триггеров — парсим один раз при старте */
let _cache: SkillTrigger[] | null = null;

function getTriggers(): SkillTrigger[] {
  if (!_cache) {
    _cache = loadTriggers();
    console.error(`[skill-triggers] Loaded ${_cache.length} skills with auto-triggers`);
  }
  return _cache;
}

/** Сброс кеша (для тестов) */
export function resetCache(): void {
  _cache = null;
}

/**
 * Сканирует сообщение пользователя и возвращает список скиллов
 * для авто-загрузки.
 */
export function scanMessage(message: string): ScanResult {
  const lower = message.toLowerCase();
  const triggers = getTriggers();
  const skills: string[] = [];
  const matched: { skill: string; trigger: string }[] = [];

  for (const st of triggers) {
    let found = false;
    let matchedTrigger = "";

    // Проверяем ключевые слова
    for (const word of st.triggers) {
      if (lower.includes(word)) {
        found = true;
        matchedTrigger = word;
        break;
      }
    }

    // Проверяем регулярки
    if (!found && st.patterns) {
      for (const re of st.patterns) {
        if (re.test(message)) {
          found = true;
          matchedTrigger = `regex:${re.source}`;
          break;
        }
      }
    }

    if (found) {
      skills.push(st.name);
      matched.push({ skill: st.name, trigger: matchedTrigger });
    }
  }

  return { skills, matched };
}

/**
 * Форматирует результат сканирования для инжекта в контекст модели.
 * Возвращает null если ничего не найдено.
 */
export function formatTriggerHint(result: ScanResult): string | null {
  if (result.skills.length === 0) return null;

  const names = result.skills.join(", ");
  return `[AUTO-TRIGGER #27] Сообщение пользователя совпало с триггерами скиллов: ${names}. ЗАГРУЗИ их через load_skill перед ответом — не полагайся на свою память.`;
}
